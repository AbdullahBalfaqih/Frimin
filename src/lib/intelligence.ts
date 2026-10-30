import { hashEvidencePayload } from './crypto-trail';
import {
  RawDexPair,
  RawNewsItem,
  RawSocialPost,
  walkOrderBookDepth,
} from './live-sources';
import {
  BEARISH_LEXICON,
  BULLISH_LEXICON,
  CONVICTION_BOOST_CUES,
  HEDGE_PENALTY_CUES,
  TRACKED_ASSETS,
  URGENCY_CUES,
} from './rulebook';
import {
  BullBearDebate,
  ContributingVoiceRef,
  ConvergenceCluster,
  DebateArgument,
  HunterGateResult,
  KOLVoice,
  L2OrderBookSnapshot,
  MarketSnapshot,
  NewsVerification,
  ParsedKOLSignal,
  PracticePosition,
  RiskConfig,
  SkippedSignalRecord,
  TokenHunterCandidate,
  TokenMention,
  TradeStrategy,
  WhaleAlertVerdict,
} from './types';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts USD notional values mentioned in whale / institutional posts (e.g. "$42.5M", "$120 million", "1.2B").
 */
export function extractEstimatedUsd(text: string): number | null {
  const m1 = text.match(
    /\$\s*(\d+(?:[.,]\d+)?)\s*(billion|million|b|m|k)\b/i
  );
  if (m1) {
    const num = parseFloat(m1[1].replace(/,/g, ''));
    const unit = m1[2].toLowerCase();
    if (!Number.isFinite(num)) return null;
    if (unit === 'b' || unit === 'billion') return Math.round(num * 1_000_000_000);
    if (unit === 'm' || unit === 'million') return Math.round(num * 1_000_000);
    if (unit === 'k') return Math.round(num * 1_000);
  }
  const m2 = text.match(/\((\d+(?:,\d{3})+)\s*USD\)/i);
  if (m2) {
    const num = parseFloat(m2[1].replace(/,/g, ''));
    if (Number.isFinite(num)) return Math.round(num);
  }
  return null;
}

/**
 * Detects tracked crypto symbols mentioned in a text string using strict cashtag and word-boundary matching.
 */
export function detectTokensInText(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();

  for (const asset of TRACKED_ASSETS) {
    // Check explicit $SYM cashtag first
    const cashtagRe = new RegExp(`\\$${escapeRegExp(asset.symbol)}\\b`, 'i');
    if (cashtagRe.test(text)) {
      found.add(asset.symbol);
      continue;
    }
    // Check strict word boundaries on aliases
    for (const alias of asset.aliases) {
      const wordRe = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i');
      if (wordRe.test(lower)) {
        // Guard common English words like "near" or "link" unless capitalized, cashtagged, or surrounded by market context
        if (alias === 'near' || alias === 'link' || alias === 'uni') {
          const exactTickerRe = new RegExp(`\\b${asset.symbol}\\b`);
          const fullNameRe =
            alias === 'near'
              ? /\bnear protocol\b/i
              : alias === 'link'
              ? /\bchainlink\b/i
              : /\buniswap\b/i;
          if (exactTickerRe.test(text) || fullNameRe.test(text)) {
            found.add(asset.symbol);
          }
        } else {
          found.add(asset.symbol);
        }
        break;
      }
    }
  }

  return Array.from(found);
}

/**
 * Scores sentiment, conviction, urgency, and whale flow on the specific clause(s) mentioning a token.
 */
function scoreTokenClause(
  symbol: string,
  fullText: string,
  trustWeight: number,
  category: KOLVoice['category']
): TokenMention {
  // Split into clauses so opposing views on two tokens in one post do not cross-contaminate
  const clauses = fullText
    .split(/(?:[.!?\n;]+|\bbut\b|\bwhile\b|\bwhereas\b)/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const matchingClauses = clauses.filter((c) =>
    detectTokensInText(c).includes(symbol)
  );
  const targetClause =
    matchingClauses.length > 0 ? matchingClauses.join(' . ') : fullText;
  const lowerClause = targetClause.toLowerCase();
  const lowerFull = fullText.toLowerCase();

  let bullScore = 0;
  let bearScore = 0;
  const matchedBullCues: string[] = [];
  const matchedBearCues: string[] = [];

  for (const [word, weight] of Object.entries(BULLISH_LEXICON)) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
    if (re.test(lowerClause)) {
      // Check simple negation ("not bullish", "no breakout")
      const negRe = new RegExp(
        `\\b(?:not|no|never|failed|fake)\\s+(?:\\w+\\s+)?${escapeRegExp(word)}\\b`,
        'i'
      );
      if (negRe.test(lowerClause)) {
        bearScore += weight * 0.85;
        matchedBearCues.push(`!${word}`);
      } else {
        bullScore += weight;
        matchedBullCues.push(word);
      }
    }
  }

  for (const [word, weight] of Object.entries(BEARISH_LEXICON)) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
    if (re.test(lowerClause)) {
      const negRe = new RegExp(
        `\\b(?:not|no|zero|unaffected)\\s+(?:\\w+\\s+)?${escapeRegExp(word)}\\b`,
        'i'
      );
      if (!negRe.test(lowerClause)) {
        bearScore += weight;
        matchedBearCues.push(word);
      }
    }
  }

  // Contextual whale transfer heuristics ("transferred from unknown wallet to Binance" -> dump risk; "withdrew from Binance" -> accumulation)
  let whaleFlowType: TokenMention['whaleFlowType'] | undefined;
  const estimatedUsd = extractEstimatedUsd(fullText);
  const isWhaleContext =
    category === 'On-Chain Whale' ||
    /\b(?:whale|transferred|withdrew|deposited|accumulated|wallet)\b/i.test(
      lowerFull
    ) ||
    (estimatedUsd !== null && estimatedUsd >= 2_000_000);

  if (isWhaleContext) {
    if (
      /\b(?:to\s+(?:binance|coinbase|kraken|okx|bybit)|deposited\s+to)\b/i.test(
        lowerClause
      )
    ) {
      bearScore += 0.42;
      matchedBearCues.push('cex_inflow');
      whaleFlowType = 'EXCHANGE_DUMP_INFLOW';
    } else if (
      /\b(?:from\s+(?:binance|coinbase|kraken|okx|bybit)|withdrew|accumulated|bought)\b/i.test(
        lowerClause
      )
    ) {
      bullScore += 0.42;
      matchedBullCues.push('cex_outflow_accum');
      whaleFlowType = 'ACCUMULATION_OUTFLOW';
    } else if (/\bunknown wallet to unknown wallet\b/i.test(lowerClause)) {
      whaleFlowType = 'LARGE_TRANSFER_NEUTRAL';
    }
  }

  // Normalize sentiment into [-1.0, +1.0]
  const rawNet = bullScore - bearScore;
  const sentiment = Number(clamp(Math.tanh(rawNet * 1.15), -1, 1).toFixed(3));
  const direction: TokenMention['direction'] =
    sentiment >= 0.14 ? 'BULLISH' : sentiment <= -0.14 ? 'BEARISH' : 'NEUTRAL';

  // Conviction calculation (baseline 0.48, boosted by hard evidence cues, penalized by hedging)
  const matchedConvictionCues = CONVICTION_BOOST_CUES.filter((cue) =>
    lowerFull.includes(cue)
  );
  const matchedHedgeCues = HEDGE_PENALTY_CUES.filter((cue) =>
    lowerFull.includes(cue)
  );

  let conviction =
    0.48 +
    Math.min(0.36, matchedConvictionCues.length * 0.11) +
    Math.min(0.16, Math.abs(sentiment) * 0.2);
  if (matchedHedgeCues.length > 0) {
    conviction = conviction * Math.pow(0.62, matchedHedgeCues.length);
  }
  conviction = Number(clamp(conviction, 0.1, 0.99).toFixed(2));

  // Urgency calculation
  const matchedUrgencyCues = URGENCY_CUES.filter((cue) =>
    lowerFull.includes(cue)
  );
  const capsWords = (fullText.match(/\b[A-Z]{4,}\b/g) || []).filter(
    (w) => !TRACKED_ASSETS.some((a) => a.symbol === w) && w !== 'USDT' && w !== 'USDC'
  );
  let urgency =
    0.25 +
    Math.min(0.55, matchedUrgencyCues.length * 0.2) +
    (capsWords.length >= 2 ? 0.15 : 0);
  urgency = Number(clamp(urgency, 0.15, 1.0).toFixed(2));

  const weightedSignal = Number(
    (sentiment * conviction * (1 + 0.35 * urgency) * trustWeight).toFixed(3)
  );

  return {
    symbol,
    clause: targetClause.slice(0, 260),
    sentiment,
    direction,
    conviction,
    urgency,
    matchedBullCues,
    matchedBearCues,
    matchedConvictionCues,
    matchedHedgeCues,
    matchedUrgencyCues,
    weightedSignal,
    isWhaleFlow: Boolean(isWhaleContext && (whaleFlowType || estimatedUsd)),
    whaleFlowType,
    estimatedUsd,
  };
}

/**
 * Parses a raw social/KOL post into a deterministic content-addressed signal record.
 */
export function parseKOLPost(
  post: RawSocialPost,
  marketMap: Map<string, MarketSnapshot>
): ParsedKOLSignal | null {
  const symbols = detectTokensInText(post.text);
  if (symbols.length === 0) return null;

  const mentions = symbols.map((sym) =>
    scoreTokenClause(sym, post.text, post.trustWeight, post.category)
  );

  const postHash = hashEvidencePayload({
    voiceId: post.voiceId,
    handle: post.handle,
    platform: post.platform,
    url: post.url,
    text: post.text,
    publishedAt: post.publishedAt,
  });

  const priceAtSignalByToken: Record<string, number> = {};
  for (const sym of symbols) {
    const snap = marketMap.get(sym);
    if (snap) {
      priceAtSignalByToken[sym] = snap.spotPrice;
    }
  }

  return {
    id: `sig-${postHash.slice(0, 12)}`,
    postHash,
    voiceId: post.voiceId,
    voiceName: post.voiceName,
    handle: post.handle,
    platform: post.platform,
    category: post.category,
    url: post.url,
    rawText: post.text,
    publishedAt: post.publishedAt,
    views: post.views,
    trustAtSignal: post.trustWeight,
    mentions,
    priceAtSignalByToken,
    graded24h: false,
  };
}

/**
 * Dynamically grades historical KOL signals (>= 4 hours old) against subsequent spot price movement,
 * updating each voice's dynamicTrust score transparently.
 */
export function gradeHistoricalSignals(
  signals: ParsedKOLSignal[],
  voices: KOLVoice[],
  marketMap: Map<string, MarketSnapshot>,
  nowIso: string
): { updatedSignals: ParsedKOLSignal[]; updatedVoices: KOLVoice[] } {
  const nowMs = new Date(nowIso).getTime();
  const voiceMap = new Map<string, KOLVoice>(
    voices.map((v) => [v.id, { ...v }])
  );

  const updatedSignals = signals.map((sig) => {
    if (sig.graded24h) return sig;
    const ageHours = (nowMs - new Date(sig.publishedAt).getTime()) / 3_600_000;
    if (ageHours < 4 || !sig.priceAtSignalByToken) return sig;

    let anyGraded = false;
    const voice = voiceMap.get(sig.voiceId);
    if (!voice) return sig;

    for (const m of sig.mentions) {
      if (m.direction === 'NEUTRAL') continue;
      const entryPx = sig.priceAtSignalByToken[m.symbol];
      const currentSnap = marketMap.get(m.symbol);
      if (!entryPx || !currentSnap || entryPx <= 0) continue;

      const movePct = ((currentSnap.spotPrice - entryPx) / entryPx) * 100;
      if (Math.abs(movePct) < 0.25) continue; // Ignore flat noise

      anyGraded = true;
      voice.gradedCalls += 1;
      const correct =
        (m.direction === 'BULLISH' && movePct > 0) ||
        (m.direction === 'BEARISH' && movePct < 0);
      if (correct) {
        voice.accurateCalls += 1;
        voice.dynamicTrust = Number(
          clamp(voice.dynamicTrust + 0.04, 0.4, 2.0).toFixed(2)
        );
      } else {
        voice.dynamicTrust = Number(
          clamp(voice.dynamicTrust - 0.03, 0.4, 2.0).toFixed(2)
        );
      }
    }

    return anyGraded ? { ...sig, graded24h: true } : sig;
  });

  return {
    updatedSignals,
    updatedVoices: voices.map((v) => voiceMap.get(v.id) ?? v),
  };
}

/**
 * ⭐ Spotlight Engine: Detects Multi-KOL Narrative Convergence within sliding time windows.
 * Enforces distinct voice deduplication, opposing sentiment penalty, and live market alignment checks.
 */
export function detectNarrativeConvergences(
  signals: ParsedKOLSignal[],
  marketMap: Map<string, MarketSnapshot>,
  riskConfig: RiskConfig,
  nowIso: string
): ConvergenceCluster[] {
  const nowMs = new Date(nowIso).getTime();
  const windowMs = riskConfig.convergenceWindowHours * 3_600_000;

  // Keep recent signals inside window (with fallback up to 72h if channels post less frequently, weighted by recency)
  const effectiveWindowMs = Math.max(windowMs, 12 * 3_600_000);
  const recentSignals = signals.filter((s) => {
    const t = new Date(s.publishedAt).getTime();
    return Number.isFinite(t) && nowMs - t <= effectiveWindowMs && nowMs - t >= -300_000;
  });

  const clusters: ConvergenceCluster[] = [];

  for (const asset of TRACKED_ASSETS) {
    const snap = marketMap.get(asset.symbol);
    if (!snap) continue;

    for (const targetSide of ['LONG', 'SHORT'] as const) {
      const targetDir = targetSide === 'LONG' ? 'BULLISH' : 'BEARISH';
      const oppDir = targetSide === 'LONG' ? 'BEARISH' : 'BULLISH';

      // Deduplicate by voiceId -> take strongest recent signal per distinct voice
      const byVoice = new Map<string, ContributingVoiceRef>();
      let opposingScore = 0;

      for (const sig of recentSignals) {
        const mention = sig.mentions.find((m) => m.symbol === asset.symbol);
        if (!mention || mention.direction === 'NEUTRAL') continue;

        const ageHours = Math.max(
          0,
          (nowMs - new Date(sig.publishedAt).getTime()) / 3_600_000
        );
        const recencyDecay = clamp(
          1 - ageHours / (riskConfig.convergenceWindowHours * 1.5),
          0.35,
          1.0
        );

        const mag =
          Math.abs(mention.sentiment) *
          mention.conviction *
          (1 + 0.35 * mention.urgency) *
          sig.trustAtSignal *
          recencyDecay;

        if (mention.direction === targetDir) {
          const existing = byVoice.get(sig.voiceId);
          if (!existing || mag > existing.contributionScore) {
            byVoice.set(sig.voiceId, {
              postHash: sig.postHash,
              voiceId: sig.voiceId,
              voiceName: sig.voiceName,
              handle: sig.handle,
              platform: sig.platform,
              sentiment: mention.sentiment,
              conviction: mention.conviction,
              urgency: mention.urgency,
              trustWeight: sig.trustAtSignal,
              contributionScore: Number(mag.toFixed(3)),
              excerpt: mention.clause,
              url: sig.url,
              publishedAt: sig.publishedAt,
            });
          }
        } else if (mention.direction === oppDir) {
          opposingScore += mag;
        }
      }

      if (byVoice.size === 0) continue;

      const contributors = Array.from(byVoice.values()).sort(
        (a, b) => b.contributionScore - a.contributionScore
      );
      const distinctVoices = contributors.length;
      const rawSupport = contributors.reduce(
        (acc, c) => acc + c.contributionScore,
        0
      );
      const netRawScore = Number(
        Math.max(0, rawSupport - opposingScore * 0.65).toFixed(3)
      );

      // Narrative Convergence Index (0..100): combines distinct voice breadth + trust-weighted intensity
      const voiceBreadthPts = Math.min(45, distinctVoices * 16);
      const intensityPts = Math.min(55, netRawScore * 34);
      const nciScore = Math.round(clamp(voiceBreadthPts + intensityPts, 0, 100));

      const avgSentiment = Number(
        (
          contributors.reduce((a, c) => a + c.sentiment, 0) / distinctVoices
        ).toFixed(2)
      );
      const avgConviction = Number(
        (
          contributors.reduce((a, c) => a + c.conviction, 0) / distinctVoices
        ).toFixed(2)
      );
      const avgUrgency = Number(
        (
          contributors.reduce((a, c) => a + c.urgency, 0) / distinctVoices
        ).toFixed(2)
      );

      // Market confirmation check: ensure price is neither violently breaking against narrative (>4.5%) nor already over-extended (>14%)
      let marketAligned = true;
      let marketCheckNote = '';
      if (targetSide === 'LONG') {
        if (snap.return6hPct < -4.5) {
          marketAligned = false;
          marketCheckNote = `Blocked: 6h price momentum (${snap.return6hPct}%) falling sharply against bullish narrative`;
        } else if (snap.return24hPct > 14.0 || snap.rsi14 > 78) {
          marketAligned = false;
          marketCheckNote = `Blocked: Narrative likely priced in (24h +${snap.return24hPct}%, RSI ${snap.rsi14})`;
        } else {
          marketCheckNote = `Confirmed: Spot $${snap.spotPrice.toLocaleString()} (6h ${snap.return6hPct >= 0 ? '+' : ''}${snap.return6hPct}%, RSI ${snap.rsi14})`;
        }
      } else {
        if (snap.return6hPct > 4.5) {
          marketAligned = false;
          marketCheckNote = `Blocked: 6h price squeezing higher (+${snap.return6hPct}%) against bearish narrative`;
        } else if (snap.return24hPct < -14.0 || snap.rsi14 < 22) {
          marketAligned = false;
          marketCheckNote = `Blocked: Downside already stretched (24h ${snap.return24hPct}%, RSI ${snap.rsi14})`;
        } else {
          marketCheckNote = `Confirmed: Spot $${snap.spotPrice.toLocaleString()} (6h ${snap.return6hPct}%, RSI ${snap.rsi14})`;
        }
      }

      let passesThreshold = true;
      let rejectionReason: string | undefined;

      if (distinctVoices < riskConfig.minConvergenceVoices) {
        passesThreshold = false;
        rejectionReason = `Only ${distinctVoices}/${riskConfig.minConvergenceVoices} distinct KOL voice(s) aligned`;
      } else if (nciScore < riskConfig.minNciScore) {
        passesThreshold = false;
        rejectionReason = `NCI ${nciScore} below threshold ${riskConfig.minNciScore}`;
      } else if (opposingScore > rawSupport * 0.7) {
        passesThreshold = false;
        rejectionReason = `Strong opposing KOL disagreement (${opposingScore.toFixed(2)} vs ${rawSupport.toFixed(2)})`;
      } else if (!marketAligned) {
        passesThreshold = false;
        rejectionReason = marketCheckNote;
      }

      const clusterPayload = {
        symbol: asset.symbol,
        direction: targetSide,
        nciScore,
        distinctVoices,
        netRawScore,
        opposingScore: Number(opposingScore.toFixed(3)),
        postHashes: contributors.map((c) => c.postHash),
        marketEvidenceHash: snap.rawEvidenceHash,
      };
      const evidenceHash = hashEvidencePayload(clusterPayload);

      clusters.push({
        id: `conv-${asset.symbol.toLowerCase()}-${targetSide.toLowerCase()}-${evidenceHash.slice(0, 8)}`,
        symbol: asset.symbol,
        direction: targetSide,
        nciScore,
        rawScore: netRawScore,
        distinctVoices,
        windowHours: riskConfig.convergenceWindowHours,
        opposingScore: Number(opposingScore.toFixed(3)),
        avgSentiment,
        avgConviction,
        avgUrgency,
        marketAligned,
        marketCheckNote,
        spotPriceAtCheck: snap.spotPrice,
        passesThreshold,
        rejectionReason,
        contributingSignals: contributors,
        evidenceHash,
        detectedAt: nowIso,
      });
    }
  }

  return clusters.sort((a, b) => {
    if (a.passesThreshold !== b.passesThreshold) {
      return a.passesThreshold ? -1 : 1;
    }
    return b.nciScore - a.nciScore;
  });
}

/**
 * News Checker Agent: Verifies live crypto news stories, connects them to cross-venue market evidence,
 * and explains concrete cause-and-effect impact.
 */
export function verifyNewsStories(
  newsItems: RawNewsItem[],
  marketMap: Map<string, MarketSnapshot>
): NewsVerification[] {
  const results: NewsVerification[] = [];
  const btcSnap = marketMap.get('BTC');

  for (const item of newsItems.slice(0, 18)) {
    const combined = `${item.title}. ${item.description}`;
    const detected = detectTokensInText(combined);
    const primarySymbol = detected[0] || 'BTC';
    const snap = marketMap.get(primarySymbol) || btcSnap;
    if (!snap) continue;

    const lower = combined.toLowerCase();
    let bull = 0;
    let bear = 0;
    for (const [w, wt] of Object.entries(BULLISH_LEXICON)) {
      if (new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i').test(lower)) bull += wt;
    }
    for (const [w, wt] of Object.entries(BEARISH_LEXICON)) {
      if (new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i').test(lower)) bear += wt;
    }

    const sentimentScore = Number(clamp(bull - bear, -1.5, 1.5).toFixed(2));
    const storySentiment: NewsVerification['storySentiment'] =
      sentimentScore >= 0.2
        ? 'POSITIVE'
        : sentimentScore <= -0.2
        ? 'NEGATIVE'
        : 'NEUTRAL';

    const marketReactionConfirmed =
      (storySentiment === 'POSITIVE' &&
        (snap.return24hPct > 0.4 || snap.volumeZScore > 0.3)) ||
      (storySentiment === 'NEGATIVE' &&
        (snap.return24hPct < -0.4 || snap.volumeZScore > 0.3)) ||
      (storySentiment === 'NEUTRAL' && Math.abs(snap.return24hPct) < 3.0);

    const credibilityScore = Math.round(
      clamp(
        68 +
          (snap.crossVenueVerified ? 14 : 0) +
          (marketReactionConfirmed ? 14 : -8),
        35,
        98
      )
    );

    const rawHash = hashEvidencePayload({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      marketEvidenceHash: snap.rawEvidenceHash,
    });

    const causeAndEffect =
      storySentiment === 'POSITIVE'
        ? `Catalyst on ${ detected.length ? detected.join(', ') : 'broad crypto (' + primarySymbol + ')' } (${item.source}) → ${primarySymbol} 24h return ${snap.return24hPct >= 0 ? '+' : ''}${snap.return24hPct}% with Vol Z-Score ${snap.volumeZScore}σ (${marketReactionConfirmed ? 'Orderflow Confirms Bid' : 'Muted Spot Follow-Through'})`
        : storySentiment === 'NEGATIVE'
        ? `Risk headline on ${ detected.length ? detected.join(', ') : 'market (' + primarySymbol + ')' } (${item.source}) → ${primarySymbol} 24h return ${snap.return24hPct}% & 8h funding ${snap.fundingRate8hPct}% (${marketReactionConfirmed ? 'Defensive De-risking Confirmed' : 'Absorbed Without Panic'})`
        : `Informational update (${item.source}) → ${primarySymbol} trading at $${snap.spotPrice.toLocaleString()} within ${snap.atrPct}% hourly ATR band`;

    const cryptoImpact =
      storySentiment === 'POSITIVE'
        ? marketReactionConfirmed
          ? `Constructive tailwind for ${primarySymbol}; supports long bias while cross-venue spread remains tight (${snap.crossVenueSpreadPct}%).`
          : `Headline is positive, but spot volume (${snap.volumeZScore}σ) shows limited institutional chase so far — wait for convergence.`
        : storySentiment === 'NEGATIVE'
        ? marketReactionConfirmed
          ? `Active headwind for ${primarySymbol}; elevates downside tail-risk and tightens long stop-loss requirements.`
          : `Market is absorbing negative headline smoothly (${primarySymbol} ${snap.return24hPct >= 0 ? '+' : ''}${snap.return24hPct}%), signaling seller exhaustion.`
        : `Neutral structural impact; volatility driven primarily by technical positioning and perp funding (${snap.fundingRate8hPct}%).`;

    results.push({
      id: `news-${rawHash.slice(0, 10)}`,
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      rawHash,
      detectedAssets: detected.length > 0 ? detected : [primarySymbol],
      storySentiment,
      sentimentScore,
      credibilityScore,
      marketReactionConfirmed,
      linkedAssetSymbol: primarySymbol,
      linkedAssetMove24hPct: snap.return24hPct,
      linkedVolumeZScore: snap.volumeZScore,
      causeAndEffect,
      cryptoImpact,
    });
  }

  return results;
}

/**
 * Whale Movement Tracker: Connects notable on-chain wallet transfers and smart-money alerts to a binding market verdict.
 */
export function evaluateWhaleMovements(
  signals: ParsedKOLSignal[],
  marketMap: Map<string, MarketSnapshot>,
  directRpcWhales: WhaleAlertVerdict[] = []
): WhaleAlertVerdict[] {
  const verdicts: WhaleAlertVerdict[] = [...directRpcWhales];

  for (const sig of signals) {
    for (const m of sig.mentions) {
      if (
        !m.isWhaleFlow &&
        sig.category !== 'On-Chain Whale' &&
        !(m.estimatedUsd && m.estimatedUsd >= 1_000_000)
      ) {
        continue;
      }
      const snap = marketMap.get(m.symbol);
      if (!snap) continue;

      const flowType: WhaleAlertVerdict['flowType'] =
        m.whaleFlowType ??
        (m.direction === 'BULLISH'
          ? 'ACCUMULATION_OUTFLOW'
          : m.direction === 'BEARISH'
          ? 'EXCHANGE_DUMP_INFLOW'
          : 'LARGE_TRANSFER_NEUTRAL');

      let marketVerdict: WhaleAlertVerdict['marketVerdict'] =
        'NEUTRAL_REBALANCE';
      let explanation = '';

      if (flowType === 'ACCUMULATION_OUTFLOW') {
        marketVerdict = 'BULLISH_ABSORPTION';
        explanation = `Whale custody outflow / accumulation on ${m.symbol}${
          m.estimatedUsd ? ` (~$${(m.estimatedUsd / 1e6).toFixed(1)}M)` : ''
        } removes liquid exchange supply while spot trades at $${snap.spotPrice.toLocaleString()} (RSI ${snap.rsi14}).`;
      } else if (flowType === 'EXCHANGE_DUMP_INFLOW') {
        marketVerdict = 'BEARISH_DISTRIBUTION';
        explanation = `Large exchange deposit / sell flow on ${m.symbol}${
          m.estimatedUsd ? ` (~$${(m.estimatedUsd / 1e6).toFixed(1)}M)` : ''
        } adds immediate orderbook supply risk (${m.symbol} 24h ${snap.return24hPct}%).`;
      } else {
        marketVerdict = 'NEUTRAL_REBALANCE';
        explanation = `Wallet-to-wallet transfer on ${m.symbol} shows custodian/OTC movement without direct exchange orderbook impact (${snap.crossVenueSpreadPct}% venue spread).`;
      }

      verdicts.push({
        id: `whale-${sig.postHash.slice(0, 8)}-${m.symbol}`,
        postHash: sig.postHash,
        sourceName: sig.voiceName,
        handle: sig.handle,
        symbol: m.symbol,
        estimatedUsd: m.estimatedUsd ?? null,
        flowType,
        marketVerdict,
        spotPrice: snap.spotPrice,
        return24hPct: snap.return24hPct,
        explanation,
        rawExcerpt: sig.rawText.slice(0, 220),
        url: sig.url,
        timestamp: sig.publishedAt,
      });
    }
  }

  return verdicts.slice(0, 16);
}

/**
 * Bull / Bear Debate + Impartial Judge:
 * Opposing agents argue strictly from the EXACT SAME content-addressed SHA-256 evidence hashes;
 * a third Judge agent weighs both cases and emits an auditable verdict.
 */
export function runBullBearDebates(
  markets: MarketSnapshot[],
  convergences: ConvergenceCluster[],
  newsVerifications: NewsVerification[],
  whaleVerdicts: WhaleAlertVerdict[],
  nowIso: string
): BullBearDebate[] {
  const debates: BullBearDebate[] = [];

  for (const snap of markets) {
    const bullConv = convergences.find(
      (c) => c.symbol === snap.symbol && c.direction === 'LONG'
    );
    const bearConv = convergences.find(
      (c) => c.symbol === snap.symbol && c.direction === 'SHORT'
    );
    const assetNews = newsVerifications.filter((n) =>
      n.detectedAssets.includes(snap.symbol)
    );
    const assetWhales = whaleVerdicts.filter((w) => w.symbol === snap.symbol);

    // Identical shared SHA-256 evidence bundle consumed by BOTH agents
    const sharedEvidenceHashes = Array.from(
      new Set([
        snap.rawEvidenceHash,
        ...(bullConv ? [bullConv.evidenceHash] : []),
        ...(bearConv ? [bearConv.evidenceHash] : []),
        ...assetNews.slice(0, 2).map((n) => n.rawHash),
        ...assetWhales.slice(0, 2).map((w) => w.postHash),
      ])
    );

    const bullArguments: DebateArgument[] = [];
    const bearArguments: DebateArgument[] = [];

    // 1. Trend vs 20h SMA & 24h VWAP
    if (snap.spotPrice >= snap.sma20) {
      const pctAbove = (((snap.spotPrice - snap.sma20) / snap.sma20) * 100).toFixed(2);
      bullArguments.push({
        rule: 'trend_above_sma20',
        weight: 1.15,
        metricValue: `$${snap.spotPrice} vs Sma20 $${snap.sma20} (+${pctAbove}%)`,
        claim: `Price holds structural support above its 20-hour moving average (+${pctAbove}%) and Vwap ($${snap.vwap24h}).`,
      });
    } else {
      const pctBelow = (((snap.sma20 - snap.spotPrice) / snap.sma20) * 100).toFixed(2);
      bearArguments.push({
        rule: 'trend_below_sma20',
        weight: 1.15,
        metricValue: `$${snap.spotPrice} vs Sma20 $${snap.sma20} (-${pctBelow}%)`,
        claim: `Price trades below its 20-hour trend baseline (-${pctBelow}%) and Vwap ($${snap.vwap24h}), signaling overhead supply.`,
      });
    }

    // 1B. Institutional MACD(12,26,9) & Live L2 Orderbook Liquidity Imbalance
    if (snap.macdHistogram > 0) {
      bullArguments.push({
        rule: 'macd_positive_impulse',
        weight: 0.65,
        metricValue: `Macd Hist +${snap.macdHistogram}`,
        claim: `Positive Macd histogram (+${snap.macdHistogram}) confirms accelerating upward hourly impulse.`,
      });
    } else if (snap.macdHistogram < 0) {
      bearArguments.push({
        rule: 'macd_negative_impulse',
        weight: 0.65,
        metricValue: `Macd Hist ${snap.macdHistogram}`,
        claim: `Negative Macd histogram (${snap.macdHistogram}) reflects downward momentum pressure.`,
      });
    }

    if (snap.l2BidDepthUsd && snap.l2AskDepthUsd && snap.l2AskDepthUsd > 0) {
      const depthRatio = Number(
        (snap.l2BidDepthUsd / snap.l2AskDepthUsd).toFixed(2)
      );
      if (depthRatio >= 1.25) {
        bullArguments.push({
          rule: 'l2_orderbook_bid_wall',
          weight: 0.75,
          metricValue: `Bid/Ask Depth ${depthRatio}x ($${Math.round(snap.l2BidDepthUsd / 1000)}k vs $${Math.round(snap.l2AskDepthUsd / 1000)}k)`,
          claim: `Live Level-2 orderbook rests ${depthRatio}x deeper bid support than ask resistance within 25 ticks.`,
        });
      } else if (depthRatio <= 0.8) {
        bearArguments.push({
          rule: 'l2_orderbook_ask_wall',
          weight: 0.75,
          metricValue: `Bid/Ask Depth ${depthRatio}x ($${Math.round(snap.l2BidDepthUsd / 1000)}k vs $${Math.round(snap.l2AskDepthUsd / 1000)}k)`,
          claim: `Live Level-2 orderbook shows heavier resting ask supply (${depthRatio}x bid/ask ratio) capping upside.`,
        });
      }
    }

    // 2. RSI Mean-Reversion / Momentum vs Exhaustion
    if (snap.rsi14 <= 38) {
      bullArguments.push({
        rule: 'rsi_oversold_value',
        weight: 1.25,
        metricValue: `RSI(14) = ${snap.rsi14}`,
        claim: `Oversold hourly RSI (${snap.rsi14}) offers asymmetric mean-reversion entry with compressed downside.`,
      });
    } else if (snap.rsi14 >= 52 && snap.rsi14 <= 68) {
      bullArguments.push({
        rule: 'rsi_constructive_momentum',
        weight: 0.85,
        metricValue: `RSI(14) = ${snap.rsi14}`,
        claim: `Constructive momentum regime (RSI ${snap.rsi14}) without overbought blow-off exhaustion.`,
      });
    }
    if (snap.rsi14 >= 69) {
      bearArguments.push({
        rule: 'rsi_overbought_exhaustion',
        weight: 1.30,
        metricValue: `RSI(14) = ${snap.rsi14}`,
        claim: `Overbought hourly RSI (${snap.rsi14}) warns of buyer exhaustion and snapback risk.`,
      });
    } else if (snap.rsi14 > 38 && snap.rsi14 < 48 && snap.return6hPct < -1.0) {
      bearArguments.push({
        rule: 'rsi_weakening_momentum',
        weight: 0.80,
        metricValue: `RSI(14) = ${snap.rsi14}, 6h ${snap.return6hPct}%`,
        claim: `Slipping momentum (${snap.return6hPct}% over 6h) without reaching capitulation oversold levels yet.`,
      });
    }

    // 3. Perpetuals Funding Crowding & Short-Squeeze Potential
    if (snap.fundingRate8hPct <= 0.002) {
      bullArguments.push({
        rule: 'perp_un_crowded_or_short_squeeze',
        weight: snap.fundingRate8hPct < 0 ? 1.20 : 0.70,
        metricValue: `8h Funding = ${snap.fundingRate8hPct}%`,
        claim:
          snap.fundingRate8hPct < 0
            ? `Negative perp funding (${snap.fundingRate8hPct}%) shows crowded shorts paying longs — prime squeeze fuel.`
            : `Neutral perp funding (${snap.fundingRate8hPct}%) confirms spot-led demand rather than frothy leverage.`,
      });
    }
    if (snap.fundingRate8hPct >= 0.014) {
      bearArguments.push({
        rule: 'perp_crowded_long_leverage',
        weight: 1.20,
        metricValue: `8h Funding = +${snap.fundingRate8hPct}%`,
        claim: `Elevated positive perp funding (+${snap.fundingRate8hPct}%) reveals crowded leveraged longs vulnerable to flush.`,
      });
    }

    // 4. Volume & Drawdown Structure
    if (snap.drawdown30hPct >= 2.2 && snap.drawdown30hPct <= 9.5) {
      bullArguments.push({
        rule: 'controlled_pullback_discount',
        weight: 0.90,
        metricValue: `30h Drawdown = -${snap.drawdown30hPct}%`,
        claim: `Healthy -${snap.drawdown30hPct}% pullback from 30h high creates favorable reward-to-risk dip geometry.`,
      });
    } else if (snap.drawdown30hPct > 9.5) {
      bearArguments.push({
        rule: 'deep_structural_drawdown',
        weight: 1.25,
        metricValue: `30h Drawdown = -${snap.drawdown30hPct}%`,
        claim: `Severe -${snap.drawdown30hPct}% drawdown from 30h peak indicates structural breakdown rather than routine dip.`,
      });
    }

    // 5. Multi-KOL Narrative Convergence Evidence
    if (bullConv && bullConv.distinctVoices >= 1) {
      bullArguments.push({
        rule: 'kol_bullish_narrative',
        weight: Number(
          clamp(0.5 + (bullConv.nciScore / 100) * 1.4, 0.5, 1.9).toFixed(2)
        ),
        metricValue: `${bullConv.distinctVoices} Voice(s), NCI ${bullConv.nciScore}`,
        claim: `${bullConv.distinctVoices} tracked market voice(s) express bullish conviction (NCI ${bullConv.nciScore}/100).`,
      });
    }
    if (bearConv && bearConv.distinctVoices >= 1) {
      bearArguments.push({
        rule: 'kol_bearish_narrative',
        weight: Number(
          clamp(0.5 + (bearConv.nciScore / 100) * 1.4, 0.5, 1.9).toFixed(2)
        ),
        metricValue: `${bearConv.distinctVoices} Voice(s), NCI ${bearConv.nciScore}`,
        claim: `${bearConv.distinctVoices} tracked market voice(s) flag downside or distribution risk (NCI ${bearConv.nciScore}/100).`,
      });
    }

    // 6. Whale & News Evidence
    const bullWhale = assetWhales.find(
      (w) => w.marketVerdict === 'BULLISH_ABSORPTION'
    );
    const bearWhale = assetWhales.find(
      (w) => w.marketVerdict === 'BEARISH_DISTRIBUTION'
    );
    if (bullWhale) {
      bullArguments.push({
        rule: 'whale_accumulation_proof',
        weight: 1.10,
        metricValue: bullWhale.sourceName,
        claim: bullWhale.explanation,
      });
    }
    if (bearWhale) {
      bearArguments.push({
        rule: 'whale_exchange_inflow_risk',
        weight: 1.15,
        metricValue: bearWhale.sourceName,
        claim: bearWhale.explanation,
      });
    }

    // Ensure both sides always articulate at least one grounded baseline argument from the evidence
    if (bullArguments.length === 0) {
      bullArguments.push({
        rule: 'cross_venue_liquidity_floor',
        weight: 0.45,
        metricValue: `Spread ${snap.crossVenueSpreadPct}%`,
        claim: `Tight cross-venue arbitrage spread (${snap.crossVenueSpreadPct}%) shows orderly spot liquidity without panic dislocation.`,
      });
    }
    if (bearArguments.length === 0) {
      bearArguments.push({
        rule: 'hourly_volatility_tax',
        weight: 0.55,
        metricValue: `ATR(14) = ${snap.atrPct}%`,
        claim: `Hourly ATR volatility (${snap.atrPct}%) imposes stop-out noise unless position sizing stays strictly capped.`,
      });
    }

    const bullTotalScore = Number(
      bullArguments.reduce((s, a) => s + a.weight, 0).toFixed(2)
    );
    const bearTotalScore = Number(
      bearArguments.reduce((s, a) => s + a.weight, 0).toFixed(2)
    );
    const netEdge = Number((bullTotalScore - bearTotalScore).toFixed(2));

    let judgeVerdict: BullBearDebate['judgeVerdict'] = 'STAND_ASIDE_NEUTRAL';
    if (!snap.crossVenueVerified) {
      judgeVerdict = 'STAND_ASIDE_NEUTRAL';
    } else if (netEdge >= 0.75) {
      judgeVerdict = 'RISK_ON_LONG';
    } else if (netEdge <= -0.75) {
      judgeVerdict = 'RISK_OFF_SHORT';
    }

    const judgeConfidence = Math.round(
      clamp(50 + Math.abs(netEdge) * 18, 50, 96)
    );

    const judgeRationale = !snap.crossVenueVerified
      ? `Judge Vetoes Action: Cross-venue spread (${snap.crossVenueSpreadPct}%) exceeds integrity threshold — standing aside.`
      : judgeVerdict === 'RISK_ON_LONG'
      ? `Bull Agent prevails (${bullTotalScore} vs ${bearTotalScore}, net +${netEdge}) across ${sharedEvidenceHashes.length} shared SHA-256 evidence records. Constructive structure + sentiment outweighs volatility risk.`
      : judgeVerdict === 'RISK_OFF_SHORT'
      ? `Bear Agent prevails (${bearTotalScore} vs ${bullTotalScore}, net ${netEdge}) across ${sharedEvidenceHashes.length} shared SHA-256 evidence records. Overhead supply / risk signals dominate.`
      : `Balanced contest (Bull ${bullTotalScore} vs Bear ${bearTotalScore}, net ${netEdge >= 0 ? '+' : ''}${netEdge}). Insufficient asymmetric edge — Judge orders Stand Aside.`;

    debates.push({
      id: `debate-${snap.symbol.toLowerCase()}-${snap.rawEvidenceHash.slice(0, 8)}`,
      symbol: snap.symbol,
      spotPrice: snap.spotPrice,
      sharedEvidenceHashes,
      bullArguments,
      bearArguments,
      bullTotalScore,
      bearTotalScore,
      netEdge,
      judgeVerdict,
      judgeConfidence,
      judgeRationale,
      timestamp: nowIso,
    });
  }

  return debates.sort((a, b) => Math.abs(b.netEdge) - Math.abs(a.netEdge));
}

/**
 * Meme / Token Hunter: Evaluates live DEX pairs against 5 published quantitative gates,
 * recording exact numbers for BOTH Selected AND Rejected candidates.
 */
export function screenTokenCandidates(
  dexPairs: RawDexPair[]
): TokenHunterCandidate[] {
  return dexPairs
    .map((p) => {
      const volToLiqRatio =
        p.liquidityUsd > 0
          ? Number((p.volume24hUsd / p.liquidityUsd).toFixed(2))
          : 0;
      const buySellRatio =
        p.sells24h > 0
          ? Number((p.buys24h / p.sells24h).toFixed(2))
          : p.buys24h > 0
          ? 2.0
          : 1.0;
      const fdvToLiq =
        p.liquidityUsd > 0 && p.fdvUsd > 0
          ? Number((p.fdvUsd / p.liquidityUsd).toFixed(1))
          : 0;

      const gates: HunterGateResult[] = [
        {
          gate: 'On-Chain Liquidity Floor',
          passed: p.liquidityUsd >= 120_000,
          actual: `$${Math.round(p.liquidityUsd).toLocaleString()}`,
          threshold: '≥ $120,000',
        },
        {
          gate: 'Volume / Liquidity Velocity',
          passed: volToLiqRatio >= 0.22,
          actual: `${volToLiqRatio}x`,
          threshold: '≥ 0.22x',
        },
        {
          gate: '24h Buy / Sell Orderflow',
          passed: buySellRatio >= 1.03,
          actual: `${buySellRatio}x (${p.buys24h}B / ${p.sells24h}S)`,
          threshold: '≥ 1.03x',
        },
        {
          gate: 'Non-Parabolic 24h Band',
          passed: p.change24hPct >= -16 && p.change24hPct <= 55,
          actual: `${p.change24hPct >= 0 ? '+' : ''}${p.change24hPct.toFixed(1)}%`,
          threshold: '[-16%, +55%]',
        },
        {
          gate: 'FDV / Liquidity Sanity',
          passed: fdvToLiq === 0 || fdvToLiq <= 350,
          actual: fdvToLiq > 0 ? `${fdvToLiq}x` : 'Unreported (Spot)',
          threshold: '≤ 350x',
        },
      ];

      const passedCount = gates.filter((g) => g.passed).length;
      const selected = passedCount === gates.length;

      const compositeScore = Math.round(
        clamp(
          passedCount * 16 +
            Math.min(12, volToLiqRatio * 6) +
            Math.min(8, (buySellRatio - 1) * 25),
          8,
          99
        )
      );

      const failedGates = gates.filter((g) => !g.passed).map((g) => `${g.gate} (${g.actual})`);
      const verdictExplanation = selected
        ? `SELECTED (${passedCount}/5 gates passed): $${p.symbol} on ${p.chain}/${p.dexId} pairs deep liquidity ($${Math.round(p.liquidityUsd).toLocaleString()}) with ${buySellRatio}x net buyer dominance and ${volToLiqRatio}x turnover.`
        : `REJECTED (${passedCount}/5 gates passed): Failed ${failedGates.join('; ')}. Filtered out to avoid illiquid slippage or blow-off exhaustion.`;

      const evidenceHash = hashEvidencePayload({
        pairAddress: p.pairAddress,
        symbol: p.symbol,
        priceUsd: p.priceUsd,
        liquidityUsd: p.liquidityUsd,
        volume24hUsd: p.volume24hUsd,
        buys24h: p.buys24h,
        sells24h: p.sells24h,
      });

      return {
        symbol: p.symbol,
        name: p.name,
        chain: p.chain,
        dexId: p.dexId,
        pairAddress: p.pairAddress,
        priceUsd: p.priceUsd,
        liquidityUsd: p.liquidityUsd,
        volume24hUsd: p.volume24hUsd,
        volToLiqRatio,
        buySellRatio,
        buys24h: p.buys24h,
        sells24h: p.sells24h,
        change24hPct: p.change24hPct,
        change1hPct: p.change1hPct,
        fdvUsd: p.fdvUsd,
        url: p.url,
        selected,
        compositeScore,
        gates,
        verdictExplanation,
        evidenceHash,
      };
    })
    .sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return b.compositeScore - a.compositeScore;
    });
}

export interface AtomicCandidateProposal {
  symbol: string;
  strategy: TradeStrategy;
  side: 'LONG' | 'SHORT';
  signalStrength: number; // 0 - 100
  stopDistancePct: number;
  rewardRiskRatio: number;
  convergenceNci?: number;
  debateVerdict?: string;
  causedByHash: string;
  contributingVoices: string[];
  evidenceHashes: string[];
  causeAndEffectChain: string[];
}

/**
 * Atomic Sizing & Execution Engine ("Treat entry, sizing and exit as one decision"):
 * 1) Marks open practice positions to live cross-checked market prices and closes hit SL/TP/TimeStops.
 * 2) Evaluates candidate atomic setups (Multi-KOL Convergence, Atomic Buy-the-Dip, High-Conviction Debate Consensus)
 *    under strict user-defined risk limits.
 */
export function evaluatePracticePortfolio(params: {
  positions: PracticePosition[];
  cashUsd: number;
  realizedPnlUsd: number;
  riskConfig: RiskConfig;
  marketMap: Map<string, MarketSnapshot>;
  orderBooks?: Map<string, L2OrderBookSnapshot>;
  convergences: ConvergenceCluster[];
  debates: BullBearDebate[];
  newsVerifications: NewsVerification[];
  nowIso: string;
}): {
  updatedPositions: PracticePosition[];
  closedThisCycle: PracticePosition[];
  newOpenProposals: {
    positionWithoutTrailHash: Omit<PracticePosition, 'openedTrailHash'>;
    causedByHash: string;
  }[];
  rejectedProposals: Omit<SkippedSignalRecord, 'trailHash'>[];
  nextCashUsd: number;
  nextRealizedPnlUsd: number;
} {
  let cashUsd = params.cashUsd;
  let realizedPnlUsd = params.realizedPnlUsd;
  const nowMs = new Date(params.nowIso).getTime();
  const closedThisCycle: PracticePosition[] = [];

  // Step 1: Mark-to-market & automatic SL / TP / Time-Stop settlement on existing OPEN positions
  const updatedPositions: PracticePosition[] = params.positions.map((pos) => {
    if (pos.status !== 'OPEN') return pos;
    const snap = params.marketMap.get(pos.symbol);
    if (!snap) return pos;

    const curPx = snap.spotPrice;
    const priceDiff =
      pos.side === 'LONG' ? curPx - pos.entryPrice : pos.entryPrice - curPx;
    const pnlUsd = Number((priceDiff * pos.quantity).toFixed(2));
    const pnlPct = Number(((pnlUsd / pos.notionalUsd) * 100).toFixed(2));

    let closeStatus: PracticePosition['status'] | null = null;
    if (pos.side === 'LONG') {
      if (curPx <= pos.stopLoss) closeStatus = 'CLOSED_SL';
      else if (curPx >= pos.takeProfit) closeStatus = 'CLOSED_TP';
    } else {
      if (curPx >= pos.stopLoss) closeStatus = 'CLOSED_SL';
      else if (curPx <= pos.takeProfit) closeStatus = 'CLOSED_TP';
    }

    if (!closeStatus && nowMs >= new Date(pos.expiresAt).getTime()) {
      closeStatus = 'CLOSED_TIME';
    }

    if (closeStatus) {
      const book = params.orderBooks?.get(pos.symbol);
      const exitExec = walkOrderBookDepth({
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        notionalUsd: pos.notionalUsd,
        book,
        fallbackMidPrice: curPx,
      });
      const realizedDiff =
        pos.side === 'LONG'
          ? exitExec.fillPrice - pos.entryPrice
          : pos.entryPrice - exitExec.fillPrice;
      const netPnlUsd = Number(
        (realizedDiff * pos.quantity - exitExec.takerFeeUsd).toFixed(2)
      );
      const netPnlPct = Number(
        ((netPnlUsd / pos.notionalUsd) * 100).toFixed(2)
      );

      cashUsd = Number((cashUsd + pos.notionalUsd + netPnlUsd).toFixed(2));
      realizedPnlUsd = Number((realizedPnlUsd + netPnlUsd).toFixed(2));
      const closedPos: PracticePosition = {
        ...pos,
        status: closeStatus,
        currentPrice: exitExec.fillPrice,
        exitPrice: exitExec.fillPrice,
        exitSlippageBps: exitExec.slippageBps,
        exitFeeUsd: exitExec.takerFeeUsd,
        closedAt: params.nowIso,
        unrealizedPnlUsd: 0,
        unrealizedPnlPct: 0,
        realizedPnlUsd: netPnlUsd,
        realizedPnlPct: netPnlPct,
      };
      closedThisCycle.push(closedPos);
      return closedPos;
    }

    return {
      ...pos,
      currentPrice: curPx,
      unrealizedPnlUsd: pnlUsd,
      unrealizedPnlPct: pnlPct,
    };
  });

  // Compute live portfolio equity & exposure after settlements
  const openPositions = updatedPositions.filter((p) => p.status === 'OPEN');
  const currentExposureUsd = openPositions.reduce(
    (s, p) => s + p.notionalUsd,
    0
  );
  const currentUnrealizedUsd = openPositions.reduce(
    (s, p) => s + p.unrealizedPnlUsd,
    0
  );
  const liveEquityUsd = Number(
    (cashUsd + currentExposureUsd + currentUnrealizedUsd).toFixed(2)
  );

  // Step 2: Gather candidate setups in priority order
  const proposals: AtomicCandidateProposal[] = [];
  const debateMap = new Map(params.debates.map((d) => [d.symbol, d]));

  // 2A. Multi-KOL Narrative Convergence proposals
  for (const cluster of params.convergences) {
    if (!cluster.passesThreshold) continue;
    const snap = params.marketMap.get(cluster.symbol);
    if (!snap) continue;
    const debate = debateMap.get(cluster.symbol);
    const stopDistPct = clamp(
      Math.max(snap.atrPct * 1.6, params.riskConfig.defaultStopLossPct * 0.8),
      1.8,
      6.5
    );
    const rrRatio = Number(
      (
        params.riskConfig.defaultTakeProfitPct /
        params.riskConfig.defaultStopLossPct
      ).toFixed(2)
    );

    proposals.push({
      symbol: cluster.symbol,
      strategy: 'KOL_CONVERGENCE',
      side: cluster.direction,
      signalStrength: cluster.nciScore,
      stopDistancePct: Number(stopDistPct.toFixed(2)),
      rewardRiskRatio: Math.max(1.8, rrRatio),
      convergenceNci: cluster.nciScore,
      debateVerdict: debate?.judgeVerdict,
      causedByHash: cluster.evidenceHash,
      contributingVoices: cluster.contributingSignals.map(
        (c) => `${c.voiceName} (${c.platform})`
      ),
      evidenceHashes: [
        snap.rawEvidenceHash,
        cluster.evidenceHash,
        ...cluster.contributingSignals.map((c) => c.postHash),
      ],
      causeAndEffectChain: [
        `CAUSE [Multi-KOL Convergence]: ${cluster.distinctVoices} distinct trusted voices (${cluster.contributingSignals
          .map((c) => c.handle)
          .join(', ')}) converged ${cluster.direction} on $${cluster.symbol} with NCI ${cluster.nciScore}/100 (avg conviction ${Math.round(
          cluster.avgConviction * 100
        )}%, urgency ${Math.round(cluster.avgUrgency * 100)}%).`,
        `MARKET CHECK [Cross-Venue Evidence]: Spot $${snap.spotPrice.toLocaleString()} verified across venues (spread ${snap.crossVenueSpreadPct}%), 6h return ${snap.return6hPct}%, RSI(14) ${snap.rsi14}, 8h perp funding ${snap.fundingRate8hPct}%.`,
        `JUDGE CROSS-CHECK: Debate Judge scored Bull ${debate?.bullTotalScore ?? 0} vs Bear ${debate?.bearTotalScore ?? 0} (${debate?.judgeVerdict ?? 'NEUTRAL'}).`,
      ],
    });
  }

  // 2B. Atomic Buy-the-Dip Agent proposals (Entry + Sizing + Exit as ONE unified decision)
  for (const snap of params.marketMap.values()) {
    // Healthy pullback [2.2%, 10.5%], non-overbought RSI <= 47, cross-venue verified, non-negative news
    const hasSevereNegativeNews = params.newsVerifications.some(
      (n) =>
        n.detectedAssets.includes(snap.symbol) &&
        n.storySentiment === 'NEGATIVE' &&
        n.sentimentScore <= -0.6
    );
    if (
      snap.drawdown30hPct >= 2.2 &&
      snap.drawdown30hPct <= 10.5 &&
      snap.rsi14 <= 47 &&
      snap.fundingRate8hPct <= 0.015 &&
      !hasSevereNegativeNews
    ) {
      const debate = debateMap.get(snap.symbol);
      const dipStrength = Math.round(
        clamp(
          52 +
            (48 - snap.rsi14) * 1.1 +
            snap.drawdown30hPct * 2.2 +
            (debate?.judgeVerdict === 'RISK_ON_LONG' ? 10 : 0),
          45,
          92
        )
      );
      const stopDistPct = Number(
        clamp(Math.max(snap.atrPct * 1.65, 2.4), 2.0, 5.5).toFixed(2)
      );
      proposals.push({
        symbol: snap.symbol,
        strategy: 'ATOMIC_BUY_THE_DIP',
        side: 'LONG',
        signalStrength: dipStrength,
        stopDistancePct: stopDistPct,
        rewardRiskRatio: 2.15,
        debateVerdict: debate?.judgeVerdict,
        causedByHash: snap.rawEvidenceHash,
        contributingVoices: ['Atomic Buy-the-Dip Quant Rule'],
        evidenceHashes: [
          snap.rawEvidenceHash,
          ...(debate ? debate.sharedEvidenceHashes : []),
        ],
        causeAndEffectChain: [
          `CAUSE [Atomic Pullback Geometry]: $${snap.symbol} pulled back -${snap.drawdown30hPct}% from its 30h high into RSI(14) = ${snap.rsi14} without negative exploit/regulatory news.`,
          `LEVERAGE SANITY: Hyperliquid 8h perp funding is ${snap.fundingRate8hPct}% (un-crowded), cross-venue spot spread is ${snap.crossVenueSpreadPct}%.`,
          `UNIFIED ATOMIC DECISION: Entry ($${snap.spotPrice}), volatility-calibrated stop (-${stopDistPct}% = 1.65×ATR), +${(
            stopDistPct * 2.15
          ).toFixed(2)}% target (2.15R), and 1% equity-at-risk sizing computed simultaneously.`,
        ],
      });
    }
  }

  // 2C. High-Margin Bull/Bear Debate Judge Consensus proposals
  for (const debate of params.debates) {
    if (
      debate.judgeVerdict !== 'STAND_ASIDE_NEUTRAL' &&
      Math.abs(debate.netEdge) >= 1.35
    ) {
      const snap = params.marketMap.get(debate.symbol);
      if (!snap) continue;
      // Skip if already proposed by KOL convergence for same symbol
      if (proposals.some((p) => p.symbol === debate.symbol)) continue;

      const side = debate.judgeVerdict === 'RISK_ON_LONG' ? 'LONG' : 'SHORT';
      const stopDistPct = Number(
        clamp(
          Math.max(snap.atrPct * 1.6, params.riskConfig.defaultStopLossPct),
          2.0,
          5.8
        ).toFixed(2)
      );
      proposals.push({
        symbol: debate.symbol,
        strategy: 'DEBATE_CONSENSUS',
        side,
        signalStrength: debate.judgeConfidence,
        stopDistancePct: stopDistPct,
        rewardRiskRatio: 2.1,
        debateVerdict: debate.judgeVerdict,
        causedByHash: snap.rawEvidenceHash,
        contributingVoices: ['Bull Agent', 'Bear Agent', 'Impartial Judge'],
        evidenceHashes: debate.sharedEvidenceHashes,
        causeAndEffectChain: [
          `CAUSE [Adversarial Debate Verdict]: Impartial Judge ruled ${debate.judgeVerdict} on $${debate.symbol} (Bull ${debate.bullTotalScore} vs Bear ${debate.bearTotalScore}, net edge ${debate.netEdge >= 0 ? '+' : ''}${debate.netEdge}).`,
          `EVIDENCE SYMMETRY: Both agents argued over the exact same ${debate.sharedEvidenceHashes.length} SHA-256 market & narrative evidence hashes.`,
        ],
      });
    }
  }

  // Step 3: Apply User-Defined Risk Limits & Atomic Position Sizing
  const newOpenProposals: {
    positionWithoutTrailHash: Omit<PracticePosition, 'openedTrailHash'>;
    causedByHash: string;
  }[] = [];
  const rejectedProposals: Omit<SkippedSignalRecord, 'trailHash'>[] = [];

  let runningOpenCount = openPositions.length;
  let runningExposureUsd = currentExposureUsd;
  const openSymbolsSet = new Set(openPositions.map((p) => p.symbol));

  const maxTotalExposureUsd =
    liveEquityUsd * (params.riskConfig.maxTotalExposurePct / 100);
  const maxSingleNotionalUsd =
    liveEquityUsd * (params.riskConfig.maxPositionPct / 100);
  const dailyDrawdownFloorUsd =
    params.riskConfig.initialEquityUsd *
    (1 - params.riskConfig.dailyMaxDrawdownPct / 100);

  for (const prop of proposals) {
    const snap = params.marketMap.get(prop.symbol);
    if (!snap) continue;

    // Gate 1: Cross-venue price integrity
    if (!snap.crossVenueVerified) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Cross-Venue Price Integrity',
        detailedReason: `Venue spread ${snap.crossVenueSpreadPct}% > max allowed ${params.riskConfig.maxCrossVenueSpreadPct}%`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    // Gate 2: Daily drawdown circuit breaker
    if (liveEquityUsd <= dailyDrawdownFloorUsd) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Daily Drawdown Circuit Breaker',
        detailedReason: `Paper equity $${liveEquityUsd} breached circuit-breaker floor $${dailyDrawdownFloorUsd.toFixed(2)}`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    // Gate 3: Short permission check
    if (prop.side === 'SHORT' && !params.riskConfig.allowShorts) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Short-Selling Disabled',
        detailedReason: `User risk config sets allowShorts = false`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    // Gate 4: Duplicate open symbol or per-token cooldown
    if (openSymbolsSet.has(prop.symbol)) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Active Symbol Exposure Gate',
        detailedReason: `An active practice position on $${prop.symbol} is already open`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    const recentClosedSameToken = updatedPositions.find(
      (p) =>
        p.symbol === prop.symbol &&
        p.closedAt &&
        (nowMs - new Date(p.closedAt).getTime()) / 3_600_000 <
          params.riskConfig.tokenCooldownHours
    );
    if (recentClosedSameToken) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Token Cooldown Gate',
        detailedReason: `$${prop.symbol} is within ${params.riskConfig.tokenCooldownHours}h post-close cooldown window`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    // Gate 5: Max concurrent open positions
    if (runningOpenCount >= params.riskConfig.maxOpenPositions) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Max Open Positions Cap',
        detailedReason: `Portfolio already holds ${runningOpenCount}/${params.riskConfig.maxOpenPositions} concurrent practice positions`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    // Atomic Sizing: Risk fixed % of equity at stop distance, capped by maxPositionPct & remaining total exposure
    const targetRiskUsd =
      liveEquityUsd *
      (params.riskConfig.riskPerTradePct / 100) *
      clamp(prop.signalStrength / 75, 0.65, 1.15);
    const stopFraction = prop.stopDistancePct / 100;
    const rawNotionalByRisk = targetRiskUsd / stopFraction;
    const remainingExposureRoom = Math.max(
      0,
      maxTotalExposureUsd - runningExposureUsd
    );

    const notionalUsd = Number(
      Math.min(
        rawNotionalByRisk,
        maxSingleNotionalUsd,
        remainingExposureRoom,
        cashUsd * 0.95
      ).toFixed(2)
    );

    // Gate 6: Exposure / Cash capacity check
    if (notionalUsd < 75) {
      rejectedProposals.push({
        id: `skip-${prop.symbol}-${nowMs}-${rejectedProposals.length}`,
        timestamp: params.nowIso,
        symbol: prop.symbol,
        side: prop.side,
        strategy: prop.strategy,
        signalStrength: prop.signalStrength,
        gateFailed: 'Max Portfolio Exposure Cap',
        detailedReason: `Remaining exposure room ($${remainingExposureRoom.toFixed(0)}) below $75 minimum ticket under ${params.riskConfig.maxTotalExposurePct}% cap`,
        hypotheticalEntry: snap.spotPrice,
      });
      continue;
    }

    const book = params.orderBooks?.get(prop.symbol);
    const l2Exec = walkOrderBookDepth({
      side: prop.side === 'LONG' ? 'BUY' : 'SELL',
      notionalUsd,
      book,
      fallbackMidPrice: snap.spotPrice,
    });

    const entryPrice = l2Exec.fillPrice;
    const stopLoss = Number(
      (prop.side === 'LONG'
        ? entryPrice * (1 - stopFraction)
        : entryPrice * (1 + stopFraction)
      ).toPrecision(6)
    );
    const takeProfitFraction = stopFraction * prop.rewardRiskRatio;
    const takeProfit = Number(
      (prop.side === 'LONG'
        ? entryPrice * (1 + takeProfitFraction)
        : entryPrice * (1 - takeProfitFraction)
      ).toPrecision(6)
    );
    const quantity = Number((notionalUsd / entryPrice).toPrecision(6));
    const actualRiskUsd = Number(
      (notionalUsd * stopFraction + l2Exec.takerFeeUsd).toFixed(2)
    );
    const riskPctOfEquity = Number(
      ((actualRiskUsd / liveEquityUsd) * 100).toFixed(2)
    );

    const expiresAt = new Date(
      nowMs + params.riskConfig.timeStopHours * 3_600_000
    ).toISOString();

    cashUsd = Number((cashUsd - notionalUsd - l2Exec.takerFeeUsd).toFixed(2));
    runningOpenCount += 1;
    runningExposureUsd += notionalUsd;
    openSymbolsSet.add(prop.symbol);

    const posId = `Pos-${prop.symbol}-${nowMs.toString(36).slice(-5)}-${runningOpenCount}`;
    const mergedEvidenceHashes = Array.from(
      new Set([
        ...prop.evidenceHashes,
        ...(l2Exec.orderBookHash ? [l2Exec.orderBookHash] : []),
      ])
    );

    newOpenProposals.push({
      causedByHash: prop.causedByHash,
      positionWithoutTrailHash: {
        id: posId,
        symbol: prop.symbol,
        strategy: prop.strategy,
        side: prop.side,
        status: 'OPEN',
        entryPrice,
        midPriceAtEntry: l2Exec.midPrice,
        slippageBps: l2Exec.slippageBps,
        spreadBps: l2Exec.spreadBps,
        takerFeeUsd: l2Exec.takerFeeUsd,
        l2DepthUsd: l2Exec.depthUsd,
        orderBookHash: l2Exec.orderBookHash,
        currentPrice: entryPrice,
        quantity,
        notionalUsd,
        riskAmountUsd: actualRiskUsd,
        riskPctOfEquity,
        stopLoss,
        takeProfit,
        rewardRiskRatio: prop.rewardRiskRatio,
        timeStopHours: params.riskConfig.timeStopHours,
        openedAt: params.nowIso,
        expiresAt,
        unrealizedPnlUsd: -l2Exec.takerFeeUsd,
        unrealizedPnlPct: Number(
          ((-l2Exec.takerFeeUsd / notionalUsd) * 100).toFixed(2)
        ),
        convergenceNci: prop.convergenceNci,
        debateVerdict: prop.debateVerdict,
        causeAndEffectChain: [
          ...prop.causeAndEffectChain,
          `Level-2 Orderbook Fill & Risk Guard: Walked live Coinbase Level-2 book (mid $${l2Exec.midPrice}, spread ${l2Exec.spreadBps} bps, depth $${l2Exec.depthUsd.toLocaleString()}) → filled $${notionalUsd.toLocaleString()} @ $${entryPrice} (slippage ${l2Exec.slippageBps} bps, taker fee $${l2Exec.takerFeeUsd}). Stop $${stopLoss} / Target $${takeProfit} (${prop.rewardRiskRatio}R). Zero exchange keys.`,
        ],
        contributingVoices: prop.contributingVoices,
        evidenceHashes: mergedEvidenceHashes,
      },
    });
  }

  return {
    updatedPositions,
    closedThisCycle,
    newOpenProposals,
    rejectedProposals: rejectedProposals.slice(0, 12),
    nextCashUsd: cashUsd,
    nextRealizedPnlUsd: realizedPnlUsd,
  };
}
