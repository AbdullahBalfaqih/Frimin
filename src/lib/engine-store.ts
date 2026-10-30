import fs from 'fs';
import path from 'path';
import {
  createTrailRecord,
  ENGINE_RULE_VERSION,
  GENESIS_PREV_HASH,
  hashEvidencePayload,
  verifyTrailChain,
} from './crypto-trail';
import {
  detectNarrativeConvergences,
  evaluatePracticePortfolio,
  evaluateWhaleMovements,
  gradeHistoricalSignals,
  parseKOLPost,
  runBullBearDebates,
  screenTokenCandidates,
  verifyNewsStories,
} from './intelligence';
import {
  fetchLiveDexCandidates,
  fetchLiveKOLsAndNews,
  fetchLiveMarkets,
  fetchLiveOnChainTelemetry,
  fetchLiveOrderBooks,
  RawSocialPost,
  walkOrderBookDepth,
} from './live-sources';
import { DEFAULT_KOL_VOICES, DEFAULT_RISK_CONFIG } from './rulebook';
import { getWritableDataDir } from './runtime-paths';
import {
  getSqliteDiagnosticsCount,
  resetSqliteLedger,
  syncCycleToSqlite,
} from './sqlite-db';
import {
  EngineState,
  KOLVoice,
  PracticePosition,
  RiskConfig,
  SkippedSignalRecord,
  TrailKind,
  TrailRecord,
  VerificationReport,
} from './types';

function getStoragePaths(): {
  dataDir: string;
  statePath: string;
  trailPath: string;
} {
  const dataDir = getWritableDataDir();
  return {
    dataDir,
    statePath: path.join(dataDir, 'state.json'),
    trailPath: path.join(dataDir, 'trail.jsonl'),
  };
}

let activeCyclePromise: Promise<{
  state: EngineState;
  trail: TrailRecord[];
  verification: VerificationReport;
}> | null = null;

function ensureDataDir(): string {
  const { dataDir } = getStoragePaths();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

export function readTrailRecords(): TrailRecord[] {
  ensureDataDir();
  const { trailPath } = getStoragePaths();
  if (!fs.existsSync(trailPath)) return [];
  const raw = fs.readFileSync(trailPath, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TrailRecord);
}

function appendTrailRecords(newRecords: TrailRecord[]): void {
  if (newRecords.length === 0) return;
  ensureDataDir();
  const { trailPath } = getStoragePaths();
  const payload = newRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.appendFileSync(trailPath, payload, 'utf8');
}

function writeStateAtomic(state: EngineState): void {
  ensureDataDir();
  const { statePath } = getStoragePaths();
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, statePath);
}

function initFreshStateAndGenesis(): {
  state: EngineState;
  trail: TrailRecord[];
} {
  const nowIso = new Date().toISOString();
  const initialState: EngineState = {
    version: ENGINE_RULE_VERSION,
    createdAt: nowIso,
    lastCycleAt: null,
    cycleCount: 0,
    cashUsd: DEFAULT_RISK_CONFIG.initialEquityUsd,
    realizedPnlUsd: 0,
    riskConfig: { ...DEFAULT_RISK_CONFIG },
    voices: DEFAULT_KOL_VOICES.map((v) => ({ ...v })),
    markets: [],
    signals: [],
    convergences: [],
    newsVerifications: [],
    debates: [],
    hunterCandidates: [],
    whaleVerdicts: [],
    positions: [],
    skippedSignals: [],
    equityHistory: [
      {
        timestamp: nowIso,
        equityUsd: DEFAULT_RISK_CONFIG.initialEquityUsd,
        cashUsd: DEFAULT_RISK_CONFIG.initialEquityUsd,
        exposureUsd: 0,
        cycleId: 'genesis',
      },
    ],
    lastSourceDiagnostics: {
      coinbaseMarketsOk: 0,
      krakenPairsOk: 0,
      hyperliquidAssetsOk: 0,
      l2OrderBooksOk: 0,
      ethBlockNumber: 0,
      ethGasGwei: 0,
      solanaSlot: 0,
      onChainWhaleLogsOk: 0,
      sqliteRowsCount: 0,
      dexScreenerPairsOk: 0,
      liveVoicesFetched: 0,
      totalRawPostsFetched: 0,
      rssItemsFetched: 0,
      cycleDurationMs: 0,
    },
  };

  const genesisRecord = createTrailRecord({
    index: 0,
    timestamp: nowIso,
    cycleId: 'genesis',
    kind: 'GENESIS',
    summary: `Initialized Frimin Autonomous Practice Ledger ($${DEFAULT_RISK_CONFIG.initialEquityUsd.toLocaleString()} paper equity, Ed25519 notarized, SQLite WAL synced, 20 tracked voices)`,
    evidenceHashes: [
      hashEvidencePayload({
        riskConfig: initialState.riskConfig,
        voicesCount: initialState.voices.length,
        ruleVersion: ENGINE_RULE_VERSION,
      }),
    ],
    causedByHash: null,
    payload: {
      systemName: 'Frimin',
      paperTradingOnly: true,
      exchangeKeysPresent: false,
      ed25519AuditSigning: true,
      sqliteWalStorage: true,
      initialEquityUsd: initialState.riskConfig.initialEquityUsd,
      riskLimits: {
        maxPositionPct: initialState.riskConfig.maxPositionPct,
        maxTotalExposurePct: initialState.riskConfig.maxTotalExposurePct,
        maxOpenPositions: initialState.riskConfig.maxOpenPositions,
        minConvergenceVoices: initialState.riskConfig.minConvergenceVoices,
        minNciScore: initialState.riskConfig.minNciScore,
      },
    },
    prevHash: GENESIS_PREV_HASH,
  });

  resetSqliteLedger();
  syncCycleToSqlite({
    cycleId: 'genesis',
    trailRecords: [genesisRecord],
    markets: [],
    signals: [],
    positions: [],
  });

  const { trailPath } = getStoragePaths();
  fs.writeFileSync(trailPath, JSON.stringify(genesisRecord) + '\n', 'utf8');
  writeStateAtomic(initialState);
  return { state: initialState, trail: [genesisRecord] };
}

export function loadPersistedState(): {
  state: EngineState;
  trail: TrailRecord[];
} {
  ensureDataDir();
  const { statePath, trailPath } = getStoragePaths();
  if (!fs.existsSync(statePath) || !fs.existsSync(trailPath)) {
    return initFreshStateAndGenesis();
  }
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as EngineState;
    const trail = readTrailRecords();
    if (trail.length === 0 || state.version !== ENGINE_RULE_VERSION) {
      return initFreshStateAndGenesis();
    }
    return { state, trail };
  } catch {
    return initFreshStateAndGenesis();
  }
}

class TrailStager {
  private nextIndex: number;
  private prevHash: string;
  private cycleId: string;
  public staged: TrailRecord[] = [];

  constructor(existingTrail: TrailRecord[], cycleId: string) {
    this.nextIndex = existingTrail.length;
    this.prevHash =
      existingTrail.length > 0
        ? existingTrail[existingTrail.length - 1].hash
        : GENESIS_PREV_HASH;
    this.cycleId = cycleId;
  }

  public add(params: {
    timestamp: string;
    kind: TrailKind;
    summary: string;
    evidenceHashes: string[];
    causedByHash?: string | null;
    payload: Record<string, unknown>;
  }): TrailRecord {
    const rec = createTrailRecord({
      index: this.nextIndex,
      timestamp: params.timestamp,
      cycleId: this.cycleId,
      kind: params.kind,
      summary: params.summary,
      evidenceHashes: params.evidenceHashes,
      causedByHash: params.causedByHash ?? null,
      payload: params.payload,
      prevHash: this.prevHash,
    });
    this.staged.push(rec);
    this.nextIndex += 1;
    this.prevHash = rec.hash;
    return rec;
  }
}

/**
 * Executes a full live autonomous observation, on-chain RPC verification,
 * L2 orderbook walk, multi-agent analysis, and Ed25519-signed practice-trading cycle.
 */
export async function runAutonomousCycle(
  extraInjectedPosts: RawSocialPost[] = []
): Promise<{
  state: EngineState;
  trail: TrailRecord[];
  verification: VerificationReport;
}> {
  if (activeCyclePromise && extraInjectedPosts.length === 0) {
    return activeCyclePromise;
  }

  const runner = async () => {
    const startedMs = Date.now();
    const { state, trail } = loadPersistedState();
    const nowIso = new Date().toISOString();
    const cycleNum = state.cycleCount + 1;
    const cycleId = `cycle-${cycleNum}-${startedMs.toString(36)}`;
    const stager = new TrailStager(trail, cycleId);

    // 1. Fetch live markets + L2 Orderbooks, live 20 KOL/RSS voices, and DexScreener pairs concurrently
    const [marketRes, socialRes, dexPairs] = await Promise.all([
      fetchLiveMarkets(state.riskConfig),
      fetchLiveKOLsAndNews(state.voices, state.riskConfig),
      fetchLiveDexCandidates(),
    ]);

    const markets =
      marketRes.snapshots.length > 0 ? marketRes.snapshots : state.markets;
    const marketMap = new Map(markets.map((m) => [m.symbol, m]));

    // 1B. Fetch Direct Ethereum Mainnet & Solana Mainnet RPC Telemetry + ERC-20 Whale Transfer Logs
    const rpcTelemetry = await fetchLiveOnChainTelemetry(marketMap);

    // Record Market + L2 Orderbook Evidence block
    const marketBlock = stager.add({
      timestamp: nowIso,
      kind: 'MARKET_EVIDENCE',
      summary: `Observed ${markets.length} live markets & ${marketRes.l2OrderBooksOk} Level-2 orderbooks (Coinbase ${marketRes.coinbaseOk}, Kraken ${marketRes.krakenOk}, Hyperliquid ${marketRes.hyperliquidOk}); Bitcoin $${markets.find((m) => m.symbol === 'BTC')?.spotPrice?.toLocaleString() ?? 'N/A'}, Ethereum $${markets.find((m) => m.symbol === 'ETH')?.spotPrice?.toLocaleString() ?? 'N/A'}, Solana $${markets.find((m) => m.symbol === 'SOL')?.spotPrice?.toLocaleString() ?? 'N/A'}`,
      evidenceHashes: markets.map((m) => m.rawEvidenceHash),
      payload: {
        marketsCount: markets.length,
        coinbaseOk: marketRes.coinbaseOk,
        krakenOk: marketRes.krakenOk,
        hyperliquidOk: marketRes.hyperliquidOk,
        l2OrderBooksOk: marketRes.l2OrderBooksOk,
        snapshotsSummary: markets.map((m) => ({
          symbol: m.symbol,
          spotPrice: m.spotPrice,
          vwap24h: m.vwap24h,
          l2SpreadBps: m.l2SpreadBps,
          spreadPct: m.crossVenueSpreadPct,
          verified: m.crossVenueVerified,
          rsi14: m.rsi14,
          macdHistogram: m.macdHistogram,
          drawdown30hPct: m.drawdown30hPct,
          funding8hPct: m.fundingRate8hPct,
          evidenceHash: m.rawEvidenceHash,
        })),
      },
    });

    // Record Direct Blockchain Mainnet RPC Evidence block
    const rpcBlock = stager.add({
      timestamp: nowIso,
      kind: 'ONCHAIN_RPC_EVIDENCE',
      summary: `Verified direct blockchain RPC telemetry: Ethereum block #${rpcTelemetry.ethBlockNumber.toLocaleString()} (${rpcTelemetry.ethGasGwei} Gwei), Solana slot #${rpcTelemetry.solanaSlot.toLocaleString()}, ${rpcTelemetry.whaleVerdicts.length} ERC-20 whale transfers decoded`,
      evidenceHashes: [
        rpcTelemetry.evidenceHash,
        ...rpcTelemetry.whaleVerdicts.map((w) => w.postHash),
      ],
      causedByHash: marketBlock.hash,
      payload: {
        ethBlockNumber: rpcTelemetry.ethBlockNumber,
        ethGasGwei: rpcTelemetry.ethGasGwei,
        solanaSlot: rpcTelemetry.solanaSlot,
        decodedWhaleTransfers: rpcTelemetry.whaleVerdicts.map((w) => ({
          symbol: w.symbol,
          usdValue: w.estimatedUsd,
          verdict: w.marketVerdict,
          txHash: w.txHash,
          blockNumber: w.blockNumber,
        })),
      },
    });

    // 2. Parse live KOL posts + merge deduplicated signal store
    const combinedRawPosts = [...extraInjectedPosts, ...socialRes.posts];
    const existingByHash = new Map(
      state.signals.map((s) => [s.postHash, s])
    );
    let newlyParsedCount = 0;

    for (const rawPost of combinedRawPosts) {
      const parsed = parseKOLPost(rawPost, marketMap);
      if (parsed && !existingByHash.has(parsed.postHash)) {
        existingByHash.set(parsed.postHash, parsed);
        newlyParsedCount++;
      }
    }

    const mergedSignals = Array.from(existingByHash.values())
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
      .slice(0, 220);

    // 3. Dynamically grade historical KOL calls (>= 4h old) against live market moves
    const graded = gradeHistoricalSignals(
      mergedSignals,
      socialRes.updatedVoices,
      marketMap,
      nowIso
    );

    const kolBatchBlock = stager.add({
      timestamp: nowIso,
      kind: 'KOL_SIGNAL_BATCH',
      summary: `Ingested ${socialRes.liveVoicesCount} live creator & research feeds (${combinedRawPosts.length} raw posts → ${mergedSignals.length} active token signals, ${newlyParsedCount} new)`,
      evidenceHashes: mergedSignals.slice(0, 25).map((s) => s.postHash),
      causedByHash: marketBlock.hash,
      payload: {
        liveVoicesFetched: socialRes.liveVoicesCount,
        rawPostsScanned: combinedRawPosts.length,
        newlyParsedSignals: newlyParsedCount,
        totalActiveSignals: mergedSignals.length,
      },
    });

    // 4. Multi-KOL Narrative Convergence Detection
    const convergences = detectNarrativeConvergences(
      graded.updatedSignals,
      marketMap,
      state.riskConfig,
      nowIso
    );

    const clusterTrailHashByEvidenceHash = new Map<string, string>();
    for (const cluster of convergences.slice(0, 6)) {
      const cBlock = stager.add({
        timestamp: nowIso,
        kind: 'CONVERGENCE_CLUSTER',
        summary: `${cluster.passesThreshold ? 'Qualified' : 'Watching'} convergence: ${cluster.symbol} ${cluster.direction} — ${cluster.distinctVoices} distinct voice(s), Score ${cluster.nciScore}/100 (${cluster.passesThreshold ? 'Passed gates' : cluster.rejectionReason})`,
        evidenceHashes: [
          cluster.evidenceHash,
          ...cluster.contributingSignals.map((c) => c.postHash),
        ],
        causedByHash: kolBatchBlock.hash,
        payload: {
          symbol: cluster.symbol,
          direction: cluster.direction,
          nciScore: cluster.nciScore,
          distinctVoices: cluster.distinctVoices,
          passesThreshold: cluster.passesThreshold,
          rejectionReason: cluster.rejectionReason ?? null,
          marketCheckNote: cluster.marketCheckNote,
          voices: cluster.contributingSignals.map((c) => ({
            handle: c.handle,
            platform: c.platform,
            sentiment: c.sentiment,
            conviction: c.conviction,
            urgency: c.urgency,
            postHash: c.postHash,
          })),
        },
      });
      clusterTrailHashByEvidenceHash.set(cluster.evidenceHash, cBlock.hash);
    }

    // 5. News Checker, Whale Movement Tracker (RPC + Social), Bull/Bear Debate + Judge, and Token Hunter
    const newsVerifications = verifyNewsStories(socialRes.newsItems, marketMap);
    if (newsVerifications.length > 0) {
      stager.add({
        timestamp: nowIso,
        kind: 'NEWS_VERIFICATION',
        summary: `News Verifier cross-checked ${newsVerifications.length} live headlines against cross-venue price & volume reaction`,
        evidenceHashes: newsVerifications.slice(0, 8).map((n) => n.rawHash),
        causedByHash: marketBlock.hash,
        payload: {
          checkedCount: newsVerifications.length,
          topVerifications: newsVerifications.slice(0, 4).map((n) => ({
            title: n.title,
            source: n.source,
            asset: n.linkedAssetSymbol,
            sentiment: n.storySentiment,
            marketConfirmed: n.marketReactionConfirmed,
            causeAndEffect: n.causeAndEffect,
          })),
        },
      });
    }

    const whaleVerdicts = evaluateWhaleMovements(
      graded.updatedSignals,
      marketMap,
      rpcTelemetry.whaleVerdicts
    );
    if (whaleVerdicts.length > 0) {
      stager.add({
        timestamp: nowIso,
        kind: 'WHALE_VERDICT',
        summary: `Whale Tracker verified ${whaleVerdicts.length} on-chain & institutional flows (${whaleVerdicts.filter((w) => w.onChainVerified).length} direct Ethereum RPC logs)`,
        evidenceHashes: whaleVerdicts.slice(0, 8).map((w) => w.postHash),
        causedByHash: rpcBlock.hash,
        payload: {
          verdictsCount: whaleVerdicts.length,
          directRpcCount: whaleVerdicts.filter((w) => w.onChainVerified).length,
          highlights: whaleVerdicts.slice(0, 4).map((w) => ({
            symbol: w.symbol,
            flowType: w.flowType,
            verdict: w.marketVerdict,
            estimatedUsd: w.estimatedUsd,
            txHash: w.txHash ?? null,
          })),
        },
      });
    }

    const debates = runBullBearDebates(
      markets,
      convergences,
      newsVerifications,
      whaleVerdicts,
      nowIso
    );
    const debateTrailHashBySymbol = new Map<string, string>();
    for (const d of debates.slice(0, 5)) {
      const dBlock = stager.add({
        timestamp: nowIso,
        kind: 'BULL_BEAR_DEBATE',
        summary: `Debate Judge [${d.symbol}]: ${d.judgeVerdict} (Bull ${d.bullTotalScore} vs Bear ${d.bearTotalScore}, net ${d.netEdge >= 0 ? '+' : ''}${d.netEdge} over ${d.sharedEvidenceHashes.length} shared hashes)`,
        evidenceHashes: d.sharedEvidenceHashes,
        causedByHash: marketBlock.hash,
        payload: {
          symbol: d.symbol,
          bullTotalScore: d.bullTotalScore,
          bearTotalScore: d.bearTotalScore,
          netEdge: d.netEdge,
          judgeVerdict: d.judgeVerdict,
          sharedEvidenceCount: d.sharedEvidenceHashes.length,
        },
      });
      debateTrailHashBySymbol.set(d.symbol, dBlock.hash);
    }

    const hunterCandidates =
      dexPairs.length > 0
        ? screenTokenCandidates(dexPairs)
        : state.hunterCandidates;
    if (hunterCandidates.length > 0) {
      const selectedCount = hunterCandidates.filter((c) => c.selected).length;
      stager.add({
        timestamp: nowIso,
        kind: 'TOKEN_HUNTER_SCREEN',
        summary: `Token Scanner evaluated ${hunterCandidates.length} live Dex pairs: ${selectedCount} selected, ${hunterCandidates.length - selectedCount} filtered with explicit rule trace`,
        evidenceHashes: hunterCandidates.map((c) => c.evidenceHash),
        causedByHash: marketBlock.hash,
        payload: {
          screened: hunterCandidates.length,
          selectedSymbols: hunterCandidates
            .filter((c) => c.selected)
            .map((c) => c.symbol),
          rejectedSymbols: hunterCandidates
            .filter((c) => !c.selected)
            .map((c) => ({
              symbol: c.symbol,
              explanation: c.verdictExplanation,
            })),
        },
      });
    }

    // 6. Settle open practice positions & execute new Atomic Practice Trades via Live L2 Orderbook Depth
    const portfolioEval = evaluatePracticePortfolio({
      positions: state.positions,
      cashUsd: state.cashUsd,
      realizedPnlUsd: state.realizedPnlUsd,
      riskConfig: state.riskConfig,
      marketMap,
      orderBooks: marketRes.orderBooks,
      convergences,
      debates,
      newsVerifications,
      nowIso,
    });

    const closedHashById = new Map<string, string>();
    for (const closed of portfolioEval.closedThisCycle) {
      const closeBlock = stager.add({
        timestamp: nowIso,
        kind: 'PRACTICE_CLOSE',
        summary: `Settled practice ${closed.side} ${closed.symbol} (${closed.status}) via Level-2 book @ $${closed.exitPrice} → Net PnL ${closed.realizedPnlUsd! >= 0 ? '+' : ''}$${closed.realizedPnlUsd} (${closed.realizedPnlPct}%)`,
        evidenceHashes: closed.evidenceHashes,
        causedByHash: closed.openedTrailHash,
        payload: {
          positionId: closed.id,
          symbol: closed.symbol,
          side: closed.side,
          status: closed.status,
          entryPrice: closed.entryPrice,
          exitPrice: closed.exitPrice,
          exitSlippageBps: closed.exitSlippageBps,
          exitFeeUsd: closed.exitFeeUsd,
          realizedPnlUsd: closed.realizedPnlUsd,
          realizedPnlPct: closed.realizedPnlPct,
        },
      });
      closedHashById.set(closed.id, closeBlock.hash);
    }

    const finalizedExistingPositions: PracticePosition[] =
      portfolioEval.updatedPositions.map((p) =>
        closedHashById.has(p.id)
          ? { ...p, closedTrailHash: closedHashById.get(p.id) }
          : p
      );

    const newlyOpenedPositions: PracticePosition[] = [];
    for (const item of portfolioEval.newOpenProposals) {
      const p = item.positionWithoutTrailHash;
      const upstreamBlockHash =
        clusterTrailHashByEvidenceHash.get(item.causedByHash) ??
        debateTrailHashBySymbol.get(p.symbol) ??
        marketBlock.hash;

      const openBlock = stager.add({
        timestamp: nowIso,
        kind: 'PRACTICE_OPEN',
        summary: `Opened practice ${p.side} ${p.symbol} [${p.strategy}] — $${p.notionalUsd} filled @ $${p.entryPrice} via Level-2 book (slippage ${p.slippageBps} bps, fee $${p.takerFeeUsd}, Stop $${p.stopLoss} / Target $${p.takeProfit})`,
        evidenceHashes: p.evidenceHashes,
        causedByHash: upstreamBlockHash,
        payload: {
          positionId: p.id,
          symbol: p.symbol,
          strategy: p.strategy,
          side: p.side,
          entryPrice: p.entryPrice,
          midPriceAtEntry: p.midPriceAtEntry,
          slippageBps: p.slippageBps,
          spreadBps: p.spreadBps,
          takerFeeUsd: p.takerFeeUsd,
          l2DepthUsd: p.l2DepthUsd,
          orderBookHash: p.orderBookHash,
          notionalUsd: p.notionalUsd,
          quantity: p.quantity,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          riskAmountUsd: p.riskAmountUsd,
          causeAndEffectChain: p.causeAndEffectChain,
          contributingVoices: p.contributingVoices,
        },
      });

      newlyOpenedPositions.push({
        ...p,
        openedTrailHash: openBlock.hash,
      });
    }

    const finalizedSkipped: SkippedSignalRecord[] = [];
    for (const rej of portfolioEval.rejectedProposals.slice(0, 5)) {
      const rejBlock = stager.add({
        timestamp: nowIso,
        kind: 'PRACTICE_REJECTED',
        summary: `Risk gate blocked ${rej.side} ${rej.symbol} [${rej.strategy}]: ${rej.gateFailed} — ${rej.detailedReason}`,
        evidenceHashes: [
          marketMap.get(rej.symbol)?.rawEvidenceHash ?? marketBlock.hash,
        ],
        causedByHash: marketBlock.hash,
        payload: { ...rej },
      });
      finalizedSkipped.push({ ...rej, trailHash: rejBlock.hash });
    }

    const allPositions = [
      ...newlyOpenedPositions,
      ...finalizedExistingPositions,
    ].slice(0, 100);

    const openNow = allPositions.filter((p) => p.status === 'OPEN');
    const exposureUsd = Number(
      openNow.reduce((s, p) => s + p.notionalUsd, 0).toFixed(2)
    );
    const unrealizedUsd = openNow.reduce((s, p) => s + p.unrealizedPnlUsd, 0);
    const totalEquityUsd = Number(
      (portfolioEval.nextCashUsd + exposureUsd + unrealizedUsd).toFixed(2)
    );

    const sqliteRowsCount = syncCycleToSqlite({
      cycleId,
      trailRecords: stager.staged,
      markets,
      signals: graded.updatedSignals,
      positions: allPositions,
      replayBundle: {
        cycleId,
        recordedAt: nowIso,
        riskConfig: state.riskConfig,
        markets,
        signals: graded.updatedSignals,
        newsVerifications,
        whaleVerdicts,
        dexPairs,
        expectedConvergences: convergences,
        expectedDebates: debates,
        expectedHunterCandidates:
          dexPairs.length > 0 ? hunterCandidates : [],
      },
    });

    const nextState: EngineState = {
      ...state,
      version: ENGINE_RULE_VERSION,
      lastCycleAt: nowIso,
      cycleCount: cycleNum,
      cashUsd: portfolioEval.nextCashUsd,
      realizedPnlUsd: portfolioEval.nextRealizedPnlUsd,
      voices: graded.updatedVoices,
      markets,
      signals: graded.updatedSignals,
      convergences,
      newsVerifications:
        newsVerifications.length > 0
          ? newsVerifications
          : state.newsVerifications,
      debates,
      hunterCandidates,
      whaleVerdicts:
        whaleVerdicts.length > 0 ? whaleVerdicts : state.whaleVerdicts,
      positions: allPositions,
      skippedSignals: [...finalizedSkipped, ...state.skippedSignals].slice(
        0,
        40
      ),
      equityHistory: [
        ...state.equityHistory,
        {
          timestamp: nowIso,
          equityUsd: totalEquityUsd,
          cashUsd: portfolioEval.nextCashUsd,
          exposureUsd,
          cycleId,
        },
      ].slice(-60),
      lastSourceDiagnostics: {
        coinbaseMarketsOk: marketRes.coinbaseOk,
        krakenPairsOk: marketRes.krakenOk,
        hyperliquidAssetsOk: marketRes.hyperliquidOk,
        l2OrderBooksOk: marketRes.l2OrderBooksOk,
        ethBlockNumber: rpcTelemetry.ethBlockNumber,
        ethGasGwei: rpcTelemetry.ethGasGwei,
        solanaSlot: rpcTelemetry.solanaSlot,
        onChainWhaleLogsOk: rpcTelemetry.whaleVerdicts.length,
        sqliteRowsCount,
        dexScreenerPairsOk: dexPairs.length,
        liveVoicesFetched: socialRes.liveVoicesCount,
        totalRawPostsFetched: combinedRawPosts.length,
        rssItemsFetched: socialRes.newsItems.length,
        cycleDurationMs: Date.now() - startedMs,
      },
    };

    appendTrailRecords(stager.staged);
    writeStateAtomic(nextState);

    const fullTrail = [...trail, ...stager.staged];
    const verification = {
      ...verifyTrailChain(fullTrail),
      sqliteSynced: true,
    };
    return { state: nextState, trail: fullTrail, verification };
  };

  if (extraInjectedPosts.length === 0) {
    activeCyclePromise = runner().finally(() => {
      activeCyclePromise = null;
    });
    return activeCyclePromise;
  }
  return runner();
}

export async function getOrBootEngine(): Promise<{
  state: EngineState;
  trail: TrailRecord[];
  verification: VerificationReport;
}> {
  const { state, trail } = loadPersistedState();
  if (state.cycleCount === 0 || state.markets.length === 0) {
    return runAutonomousCycle();
  }
  const dbDiag = getSqliteDiagnosticsCount();
  const verification = {
    ...verifyTrailChain(trail),
    sqliteSynced: dbDiag.trailCount >= trail.length,
  };
  return { state, trail, verification };
}

export function updateEngineRiskConfig(partial: Partial<RiskConfig>): {
  state: EngineState;
  trail: TrailRecord[];
  verification: VerificationReport;
} {
  const { state, trail } = loadPersistedState();
  const nowIso = new Date().toISOString();
  const updatedConfig: RiskConfig = {
    ...state.riskConfig,
    ...partial,
  };
  const cycleId = `cfg-${Date.now().toString(36)}`;
  const stager = new TrailStager(trail, cycleId);
  stager.add({
    timestamp: nowIso,
    kind: 'RISK_CONFIG_UPDATE',
    summary: `Updated Frimin risk rules: MaxPos ${updatedConfig.maxPositionPct}%, MaxExp ${updatedConfig.maxTotalExposurePct}%, MinVoices ${updatedConfig.minConvergenceVoices}, MinScore ${updatedConfig.minNciScore}`,
    evidenceHashes: [hashEvidencePayload(updatedConfig)],
    causedByHash: trail[trail.length - 1]?.hash ?? null,
    payload: {
      maxPositionPct: updatedConfig.maxPositionPct,
      maxTotalExposurePct: updatedConfig.maxTotalExposurePct,
      maxOpenPositions: updatedConfig.maxOpenPositions,
      riskPerTradePct: updatedConfig.riskPerTradePct,
      defaultStopLossPct: updatedConfig.defaultStopLossPct,
      defaultTakeProfitPct: updatedConfig.defaultTakeProfitPct,
      minConvergenceVoices: updatedConfig.minConvergenceVoices,
      minNciScore: updatedConfig.minNciScore,
      allowShorts: updatedConfig.allowShorts,
    },
  });

  syncCycleToSqlite({
    cycleId,
    trailRecords: stager.staged,
    markets: [],
    signals: [],
    positions: [],
  });

  const nextState: EngineState = {
    ...state,
    riskConfig: updatedConfig,
  };
  appendTrailRecords(stager.staged);
  writeStateAtomic(nextState);
  const fullTrail = [...trail, ...stager.staged];
  return {
    state: nextState,
    trail: fullTrail,
    verification: { ...verifyTrailChain(fullTrail), sqliteSynced: true },
  };
}

export function updateEngineVoices(voices: KOLVoice[]): {
  state: EngineState;
  verification: VerificationReport;
} {
  const { state, trail } = loadPersistedState();
  const capped = voices.slice(0, 20);
  const nextState: EngineState = {
    ...state,
    voices: capped,
  };
  writeStateAtomic(nextState);
  return {
    state: nextState,
    verification: { ...verifyTrailChain(trail), sqliteSynced: true },
  };
}

export async function closePositionManually(positionId: string): Promise<{
  state: EngineState;
  trail: TrailRecord[];
  verification: VerificationReport;
}> {
  const { state, trail } = loadPersistedState();
  const target = state.positions.find(
    (p) => p.id === positionId && p.status === 'OPEN'
  );
  if (!target) {
    return { state, trail, verification: verifyTrailChain(trail) };
  }

  const nowIso = new Date().toISOString();
  const books = await fetchLiveOrderBooks();
  const book = books.get(target.symbol);
  const snap = state.markets.find((m) => m.symbol === target.symbol);
  const fallbackPx = snap ? snap.spotPrice : target.currentPrice;

  const exitExec = walkOrderBookDepth({
    side: target.side === 'LONG' ? 'SELL' : 'BUY',
    notionalUsd: target.notionalUsd,
    book,
    fallbackMidPrice: fallbackPx,
  });

  const exitPx = exitExec.fillPrice;
  const diff =
    target.side === 'LONG'
      ? exitPx - target.entryPrice
      : target.entryPrice - exitPx;
  const pnlUsd = Number(
    (diff * target.quantity - exitExec.takerFeeUsd).toFixed(2)
  );
  const pnlPct = Number(((pnlUsd / target.notionalUsd) * 100).toFixed(2));

  const cycleId = `manual-close-${Date.now().toString(36)}`;
  const stager = new TrailStager(trail, cycleId);
  const closeBlock = stager.add({
    timestamp: nowIso,
    kind: 'PRACTICE_CLOSE',
    summary: `Settled practice ${target.side} ${target.symbol} via live Level-2 book @ $${exitPx} (slippage ${exitExec.slippageBps} bps, fee $${exitExec.takerFeeUsd}) → Net PnL ${pnlUsd >= 0 ? '+' : ''}$${pnlUsd} (${pnlPct}%)`,
    evidenceHashes: [
      ...target.evidenceHashes,
      ...(exitExec.orderBookHash ? [exitExec.orderBookHash] : []),
    ],
    causedByHash: target.openedTrailHash,
    payload: {
      positionId: target.id,
      symbol: target.symbol,
      side: target.side,
      status: 'CLOSED_MANUAL',
      entryPrice: target.entryPrice,
      exitPrice: exitPx,
      exitSlippageBps: exitExec.slippageBps,
      exitFeeUsd: exitExec.takerFeeUsd,
      realizedPnlUsd: pnlUsd,
      realizedPnlPct: pnlPct,
    },
  });

  const nextPositions: PracticePosition[] = state.positions.map((p) =>
    p.id === positionId
      ? {
          ...p,
          status: 'CLOSED_MANUAL',
          currentPrice: exitPx,
          exitPrice: exitPx,
          exitSlippageBps: exitExec.slippageBps,
          exitFeeUsd: exitExec.takerFeeUsd,
          closedAt: nowIso,
          unrealizedPnlUsd: 0,
          unrealizedPnlPct: 0,
          realizedPnlUsd: pnlUsd,
          realizedPnlPct: pnlPct,
          closedTrailHash: closeBlock.hash,
        }
      : p
  );

  syncCycleToSqlite({
    cycleId,
    trailRecords: stager.staged,
    markets: [],
    signals: [],
    positions: nextPositions,
  });

  const nextCash = Number(
    (state.cashUsd + target.notionalUsd + pnlUsd).toFixed(2)
  );
  const nextRealized = Number((state.realizedPnlUsd + pnlUsd).toFixed(2));

  const nextState: EngineState = {
    ...state,
    cashUsd: nextCash,
    realizedPnlUsd: nextRealized,
    positions: nextPositions,
  };

  appendTrailRecords(stager.staged);
  writeStateAtomic(nextState);
  const fullTrail = [...trail, ...stager.staged];
  return {
    state: nextState,
    trail: fullTrail,
    verification: { ...verifyTrailChain(fullTrail), sqliteSynced: true },
  };
}
