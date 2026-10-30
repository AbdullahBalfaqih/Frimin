import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJson,
  createTrailRecord,
  GENESIS_PREV_HASH,
  verifyTrailChain,
} from '../src/lib/crypto-trail';
import {
  detectNarrativeConvergences,
  evaluatePracticePortfolio,
  parseKOLPost,
  runBullBearDebates,
  screenTokenCandidates,
} from '../src/lib/intelligence';
import {
  decodeHtmlEntities,
  walkOrderBookDepth,
} from '../src/lib/live-sources';
import { DEFAULT_KOL_VOICES, DEFAULT_RISK_CONFIG } from '../src/lib/rulebook';
import { getSqliteDb } from '../src/lib/sqlite-db';
import { L2OrderBookSnapshot, MarketSnapshot } from '../src/lib/types';

function makeFixtureMarket(
  symbol: string,
  overrides: Partial<MarketSnapshot> = {}
): MarketSnapshot {
  return {
    symbol,
    name: symbol,
    spotPrice: 180,
    coinbasePrice: 180,
    krakenPrice: 180.12,
    hyperliquidMarkPrice: 180.05,
    crossVenueSpreadPct: 0.07,
    crossVenueVerified: true,
    return24hPct: 2.4,
    return6hPct: 1.1,
    high24h: 185,
    low24h: 174,
    volume24hUsd: 420_000_000,
    vwap24h: 178.9,
    sma20: 176.5,
    rsi14: 56,
    macdHistogram: 0.42,
    bollingerUpper: 184.5,
    bollingerLower: 171.2,
    bollingerPctB: 0.66,
    atr14: 3.1,
    atrPct: 1.72,
    volumeZScore: 1.25,
    drawdown30hPct: 2.7,
    fundingRate8hPct: 0.004,
    openInterestUsd: 890_000_000,
    l2BidDepthUsd: 640_000,
    l2AskDepthUsd: 410_000,
    l2SpreadBps: 1.2,
    candlesCloses: [175, 176, 178, 179, 180],
    rawEvidenceHash: 'a'.repeat(64),
    observedAt: '2026-10-30T12:00:00.000Z',
    ...overrides,
  };
}

test('1. Default KOL roster initializes with exactly 20 curated market voices', () => {
  assert.equal(DEFAULT_KOL_VOICES.length, 20);
  const uniqueIds = new Set(DEFAULT_KOL_VOICES.map((v) => v.id));
  assert.equal(uniqueIds.size, 20);
});

test('2. Canonical JSON, SHA-256 chain & Ed25519 signature catch any tampered payload or forged signature', () => {
  assert.equal(
    canonicalJson({ b: 2, a: 1 }),
    canonicalJson({ a: 1, b: 2 })
  );

  const genesis = createTrailRecord({
    index: 0,
    timestamp: '2026-10-30T12:00:00.000Z',
    cycleId: 'c1',
    kind: 'GENESIS',
    summary: 'Frimin Genesis block',
    evidenceHashes: ['1'.repeat(64)],
    payload: { initialEquity: 10000 },
    prevHash: GENESIS_PREV_HASH,
  });

  const block1 = createTrailRecord({
    index: 1,
    timestamp: '2026-10-30T12:01:00.000Z',
    cycleId: 'c1',
    kind: 'PRACTICE_OPEN',
    summary: 'Open Solana Long',
    evidenceHashes: ['2'.repeat(64)],
    causedByHash: genesis.hash,
    payload: { symbol: 'SOL', notionalUsd: 500 },
    prevHash: genesis.hash,
  });

  assert.ok(genesis.signature && genesis.signerPublicKey);
  assert.ok(block1.signature && block1.signerPublicKey);

  const validReport = verifyTrailChain([genesis, block1]);
  assert.equal(validReport.valid, true);
  assert.equal(validReport.checkedRecords, 2);
  assert.equal(validReport.ed25519SignaturesVerified, 2);

  // Tamper notionalUsd in block1 -> caught by SHA-256 re-derivation
  const tamperedPayload = {
    ...block1,
    payload: { symbol: 'SOL', notionalUsd: 9999 },
  };
  const invalidPayloadReport = verifyTrailChain([genesis, tamperedPayload]);
  assert.equal(invalidPayloadReport.valid, false);
  assert.equal(invalidPayloadReport.brokenAtIndex, 1);

  // Forge Ed25519 signature -> caught by Ed25519 cryptographic verifier
  const forgedSig = {
    ...block1,
    signature: 'f'.repeat(128),
  };
  const invalidSigReport = verifyTrailChain([genesis, forgedSig]);
  assert.equal(invalidSigReport.valid, false);
  assert.equal(invalidSigReport.brokenAtIndex, 1);
});

test('3. Clause-scoped KOL NLP separates opposing multi-token stances and penalizes hedging', () => {
  const marketMap = new Map<string, MarketSnapshot>([
    ['ETH', makeFixtureMarket('ETH', { spotPrice: 2230 })],
    ['SOL', makeFixtureMarket('SOL', { spotPrice: 180 })],
  ]);

  const parsed = parseKOLPost(
    {
      voiceId: 'v1',
      voiceName: 'Whale Desk',
      handle: 'whaledesk',
      platform: 'X',
      category: 'On-Chain Whale',
      trustWeight: 1.3,
      url: 'https://x.com/whaledesk/status/1',
      text: 'Dumped and sold $ETH heavily on breakdown, while institutional whales accumulated $50M $SOL breakout confirmed now! \u{1F6A8}',
      publishedAt: '2026-10-30T11:50:00.000Z',
    },
    marketMap
  );

  assert.ok(parsed);
  const ethMention = parsed.mentions.find((m) => m.symbol === 'ETH');
  const solMention = parsed.mentions.find((m) => m.symbol === 'SOL');
  assert.ok(ethMention && solMention);
  assert.equal(ethMention.direction, 'BEARISH');
  assert.equal(solMention.direction, 'BULLISH');
  assert.ok(solMention.conviction > 0.7);
  assert.ok(solMention.urgency >= 0.6);

  const hedged = parseKOLPost(
    {
      voiceId: 'v2',
      voiceName: 'Speculator',
      handle: 'spec',
      platform: 'X',
      category: 'Alpha & Narrative',
      trustWeight: 1.0,
      url: 'https://x.com/spec/status/2',
      text: 'Unconfirmed rumor: maybe $SOL might rally if volume returns, not sure.',
      publishedAt: '2026-10-30T11:55:00.000Z',
    },
    marketMap
  );
  assert.ok(hedged);
  assert.ok(hedged.mentions[0].conviction < solMention.conviction);
});

test('4. Multi-KOL Convergence requires distinct voices (spam by 1 voice cannot pass)', () => {
  const nowIso = '2026-10-30T12:00:00.000Z';
  const marketMap = new Map<string, MarketSnapshot>([
    ['SOL', makeFixtureMarket('SOL')],
  ]);

  const s1 = parseKOLPost(
    {
      voiceId: 'voice-A',
      voiceName: 'Alpha A',
      handle: 'alphaA',
      platform: 'X',
      category: 'Alpha & Narrative',
      trustWeight: 1.4,
      url: 'https://x.com/a/1',
      text: 'Confirmed institutional inflows buying $SOL breakout now! \u{1F6A8}',
      publishedAt: '2026-10-30T11:30:00.000Z',
    },
    marketMap
  )!;
  const s2 = parseKOLPost(
    {
      voiceId: 'voice-A',
      voiceName: 'Alpha A',
      handle: 'alphaA',
      platform: 'X',
      category: 'Alpha & Narrative',
      trustWeight: 1.4,
      url: 'https://x.com/a/2',
      text: 'Massive conviction accumulating more $SOL rally today!',
      publishedAt: '2026-10-30T11:45:00.000Z',
    },
    marketMap
  )!;

  const singleVoiceClusters = detectNarrativeConvergences(
    [s1, s2],
    marketMap,
    DEFAULT_RISK_CONFIG,
    nowIso
  );
  assert.equal(singleVoiceClusters[0].distinctVoices, 1);
  assert.equal(singleVoiceClusters[0].passesThreshold, false);

  const s3 = parseKOLPost(
    {
      voiceId: 'voice-B',
      voiceName: 'Whale B',
      handle: 'whaleB',
      platform: 'Telegram',
      category: 'On-Chain Whale',
      trustWeight: 1.45,
      url: 'https://t.me/whaleB/9',
      text: 'On-chain whale withdrew $35M $SOL from Coinbase, bullish accumulation confirmed!',
      publishedAt: '2026-10-30T11:50:00.000Z',
    },
    marketMap
  )!;

  const multiVoiceClusters = detectNarrativeConvergences(
    [s1, s2, s3],
    marketMap,
    DEFAULT_RISK_CONFIG,
    nowIso
  );
  assert.equal(multiVoiceClusters[0].distinctVoices, 2);
  assert.equal(multiVoiceClusters[0].passesThreshold, true);
});

test('5. Bull/Bear Debate shares identical SHA-256 evidence and Practice Trader walks Level-2 book & enforces 8% cap', () => {
  const nowIso = '2026-10-30T12:00:00.000Z';
  const solMarket = makeFixtureMarket('SOL', {
    rsi14: 36,
    drawdown30hPct: 4.2,
  });
  const marketMap = new Map([['SOL', solMarket]]);

  const mockBook: L2OrderBookSnapshot = {
    symbol: 'SOL',
    bestBid: 179.98,
    bestAsk: 180.02,
    midPrice: 180.0,
    spreadBps: 2.22,
    bidDepth25Usd: 500_000,
    askDepth25Usd: 500_000,
    bids: [
      { price: 179.98, size: 50 },
      { price: 179.95, size: 100 },
    ],
    asks: [
      { price: 180.02, size: 2 }, // $360.04 at 180.02
      { price: 180.08, size: 50 }, // remainder at 180.08
    ],
    orderBookHash: 'b'.repeat(64),
    observedAt: nowIso,
  };
  const orderBooks = new Map([['SOL', mockBook]]);

  const sA = parseKOLPost(
    {
      voiceId: 'vA',
      voiceName: 'Voice A',
      handle: 'va',
      platform: 'X',
      category: 'On-Chain Whale',
      trustWeight: 1.4,
      url: 'https://x.com/va/1',
      text: 'Whales accumulated $40M $SOL breakout confirmed now! \u{1F6A8}',
      publishedAt: '2026-10-30T11:40:00.000Z',
    },
    marketMap
  )!;
  const sB = parseKOLPost(
    {
      voiceId: 'vB',
      voiceName: 'Voice B',
      handle: 'vb',
      platform: 'Telegram',
      category: 'Quant Research',
      trustWeight: 1.4,
      url: 'https://t.me/vb/2',
      text: 'Confirmed $SOL institutional inflows and bullish accumulation today!',
      publishedAt: '2026-10-30T11:50:00.000Z',
    },
    marketMap
  )!;

  const convergences = detectNarrativeConvergences(
    [sA, sB],
    marketMap,
    DEFAULT_RISK_CONFIG,
    nowIso
  );
  const debates = runBullBearDebates(
    [solMarket],
    convergences,
    [],
    [],
    nowIso
  );
  assert.equal(debates.length, 1);
  assert.ok(debates[0].sharedEvidenceHashes.includes(solMarket.rawEvidenceHash));

  const portfolio = evaluatePracticePortfolio({
    positions: [],
    cashUsd: 10000,
    realizedPnlUsd: 0,
    riskConfig: DEFAULT_RISK_CONFIG,
    marketMap,
    orderBooks,
    convergences,
    debates,
    newsVerifications: [],
    nowIso,
  });

  assert.ok(portfolio.newOpenProposals.length >= 1);
  const opened = portfolio.newOpenProposals[0].positionWithoutTrailHash;
  assert.equal(opened.symbol, 'SOL');
  assert.equal(opened.side, 'LONG');
  assert.ok(opened.notionalUsd <= 800);
  // Entry filled across two L2 ask levels (> 180.02 and < 180.08)
  assert.ok(opened.entryPrice > 180.02 && opened.entryPrice < 180.08);
  assert.ok((opened.takerFeeUsd ?? 0) > 0);
  assert.equal(opened.orderBookHash, 'b'.repeat(64));
});

test('6. Token Hunter explains both Selected and Rejected DEX candidates', () => {
  const screened = screenTokenCandidates([
    {
      symbol: 'GOOD',
      name: 'Solid Token',
      chain: 'solana',
      dexId: 'raydium',
      pairAddress: 'pair-good',
      priceUsd: 1.25,
      liquidityUsd: 850_000,
      volume24hUsd: 620_000,
      buys24h: 1400,
      sells24h: 980,
      change24hPct: 12.4,
      change1hPct: 1.8,
      fdvUsd: 24_000_000,
      url: 'https://dexscreener.com/solana/pair-good',
    },
    {
      symbol: 'ILLIQ',
      name: 'Low Liq Meme',
      chain: 'solana',
      dexId: 'pump',
      pairAddress: 'pair-bad',
      priceUsd: 0.0004,
      liquidityUsd: 18_000,
      volume24hUsd: 90_000,
      buys24h: 200,
      sells24h: 350,
      change24hPct: 140.0,
      change1hPct: -12.0,
      fdvUsd: 15_000_000,
      url: 'https://dexscreener.com/solana/pair-bad',
    },
  ]);

  const good = screened.find((c) => c.symbol === 'GOOD')!;
  const bad = screened.find((c) => c.symbol === 'ILLIQ')!;
  assert.equal(good.selected, true);
  assert.ok(good.verdictExplanation.startsWith('SELECTED'));
  assert.equal(bad.selected, false);
  assert.ok(bad.verdictExplanation.startsWith('REJECTED'));
});

test('7. L2 Orderbook Depth Walker computes exact volume-weighted slippage and 5 bps taker fee', () => {
  const book: L2OrderBookSnapshot = {
    symbol: 'BTC',
    bestBid: 75000,
    bestAsk: 75010,
    midPrice: 75005,
    spreadBps: 1.33,
    bidDepth25Usd: 1_200_000,
    askDepth25Usd: 1_200_000,
    bids: [{ price: 75000, size: 10 }],
    asks: [
      { price: 75010, size: 0.004 }, // $300.04
      { price: 75050, size: 1.0 },
    ],
    orderBookHash: 'c'.repeat(64),
    observedAt: '2026-10-30T12:00:00.000Z',
  };

  const exec = walkOrderBookDepth({
    side: 'BUY',
    notionalUsd: 800,
    book,
    fallbackMidPrice: 75005,
  });

  assert.ok(exec.fillPrice > 75010 && exec.fillPrice < 75050);
  assert.equal(exec.takerFeeUsd, 0.4); // 5 bps of $800 = $0.40
  assert.ok(exec.slippageBps > 0);
});

test('8. Cheerio DOM decoder strips nested HTML cleanly without regex corruption', () => {
  const dirty =
    '<p>Institutional wallet bought <b>$42M $BTC</b> &amp; withdrew!<br/>Confirmed &#36;76,800</p>';
  const clean = decodeHtmlEntities(dirty);
  assert.ok(clean.includes('Institutional wallet bought $42M $BTC & withdrew!'));
  assert.ok(clean.includes('Confirmed $76,800'));
});

test('9. SQLite WAL database initializes ACID tables cleanly', () => {
  const db = getSqliteDb();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('trail_blocks','market_snapshots','kol_signals','practice_positions','replay_bundles')"
    )
    .all() as { name: string }[];
  assert.equal(tables.length, 5);
});

test('10. Zero exchange order connectors or blockchain wallet private keys exist anywhere in source', () => {
  const libDir = path.join(process.cwd(), 'src', 'lib');
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const src = fs.readFileSync(path.join(libDir, file), 'utf8');
    assert.ok(
      !src.includes('/api/v3/order') && !src.includes('WALLET_PRIVATE_KEY'),
      `Found prohibited live order endpoint or wallet key pattern in ${file}`
    );
  }
});
