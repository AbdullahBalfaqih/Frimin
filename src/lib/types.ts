export type PlatformSource = 'X' | 'Telegram' | 'Discord' | 'ResearchRSS';

export type VoiceCategory =
  | 'On-Chain Whale'
  | 'Macro & Breaking'
  | 'Quant Research'
  | 'Alpha & Narrative'
  | 'Exchange Catalyst'
  | 'DeFi & Security';

export interface KOLVoice {
  id: string;
  name: string;
  handle: string;
  platform: PlatformSource;
  feedUrl: string;
  category: VoiceCategory;
  baseTrust: number;
  dynamicTrust: number;
  gradedCalls: number;
  accurateCalls: number;
  enabled: boolean;
  lastSyncedAt?: string;
  lastPostCount?: number;
  syncStatus?: 'LIVE' | 'AWAITING_TOKEN' | 'DEGRADED';
}

export interface TokenMention {
  symbol: string;
  clause: string;
  sentiment: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  conviction: number;
  urgency: number;
  matchedBullCues: string[];
  matchedBearCues: string[];
  matchedConvictionCues: string[];
  matchedHedgeCues: string[];
  matchedUrgencyCues: string[];
  weightedSignal: number;
  isWhaleFlow: boolean;
  whaleFlowType?:
    | 'ACCUMULATION_OUTFLOW'
    | 'EXCHANGE_DUMP_INFLOW'
    | 'LARGE_TRANSFER_NEUTRAL';
  estimatedUsd?: number | null;
}

export interface ParsedKOLSignal {
  id: string;
  postHash: string;
  voiceId: string;
  voiceName: string;
  handle: string;
  platform: PlatformSource;
  category: VoiceCategory;
  url: string;
  rawText: string;
  publishedAt: string;
  views?: number;
  trustAtSignal: number;
  mentions: TokenMention[];
  priceAtSignalByToken?: Record<string, number>;
  graded24h?: boolean;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface L2OrderBookSnapshot {
  symbol: string;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spreadBps: number;
  bidDepth25Usd: number;
  askDepth25Usd: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  orderBookHash: string;
  observedAt: string;
}

export interface MarketSnapshot {
  symbol: string;
  name: string;
  spotPrice: number;
  coinbasePrice: number | null;
  krakenPrice: number | null;
  hyperliquidMarkPrice: number | null;
  crossVenueSpreadPct: number;
  crossVenueVerified: boolean;
  return24hPct: number;
  return6hPct: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  vwap24h: number;
  sma20: number;
  rsi14: number;
  macdHistogram: number;
  bollingerUpper: number;
  bollingerLower: number;
  bollingerPctB: number;
  atr14: number;
  atrPct: number;
  volumeZScore: number;
  drawdown30hPct: number;
  fundingRate8hPct: number;
  openInterestUsd: number;
  bestBid?: number;
  bestAsk?: number;
  l2SpreadBps?: number;
  l2BidDepthUsd?: number;
  l2AskDepthUsd?: number;
  orderBookHash?: string;
  candlesCloses: number[];
  rawEvidenceHash: string;
  observedAt: string;
}

export interface ContributingVoiceRef {
  postHash: string;
  voiceId: string;
  voiceName: string;
  handle: string;
  platform: PlatformSource;
  sentiment: number;
  conviction: number;
  urgency: number;
  trustWeight: number;
  contributionScore: number;
  excerpt: string;
  url: string;
  publishedAt: string;
}

export interface ConvergenceCluster {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  nciScore: number;
  rawScore: number;
  distinctVoices: number;
  windowHours: number;
  opposingScore: number;
  avgSentiment: number;
  avgConviction: number;
  avgUrgency: number;
  marketAligned: boolean;
  marketCheckNote: string;
  spotPriceAtCheck: number;
  passesThreshold: boolean;
  rejectionReason?: string;
  contributingSignals: ContributingVoiceRef[];
  evidenceHash: string;
  detectedAt: string;
}

export interface NewsVerification {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  rawHash: string;
  detectedAssets: string[];
  storySentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  sentimentScore: number;
  credibilityScore: number;
  marketReactionConfirmed: boolean;
  linkedAssetSymbol: string;
  linkedAssetMove24hPct: number;
  linkedVolumeZScore: number;
  causeAndEffect: string;
  cryptoImpact: string;
}

export interface DebateArgument {
  rule: string;
  weight: number;
  metricValue: string;
  claim: string;
}

export interface BullBearDebate {
  id: string;
  symbol: string;
  spotPrice: number;
  sharedEvidenceHashes: string[];
  bullArguments: DebateArgument[];
  bearArguments: DebateArgument[];
  bullTotalScore: number;
  bearTotalScore: number;
  netEdge: number;
  judgeVerdict: 'RISK_ON_LONG' | 'RISK_OFF_SHORT' | 'STAND_ASIDE_NEUTRAL';
  judgeConfidence: number;
  judgeRationale: string;
  timestamp: string;
}

export interface HunterGateResult {
  gate: string;
  passed: boolean;
  actual: string;
  threshold: string;
}

export interface TokenHunterCandidate {
  symbol: string;
  name: string;
  chain: string;
  dexId: string;
  pairAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  volToLiqRatio: number;
  buySellRatio: number;
  buys24h: number;
  sells24h: number;
  change24hPct: number;
  change1hPct: number;
  fdvUsd: number;
  url: string;
  selected: boolean;
  compositeScore: number;
  gates: HunterGateResult[];
  verdictExplanation: string;
  evidenceHash: string;
}

export interface WhaleAlertVerdict {
  id: string;
  postHash: string;
  sourceName: string;
  handle: string;
  symbol: string;
  estimatedUsd: number | null;
  flowType:
    | 'ACCUMULATION_OUTFLOW'
    | 'EXCHANGE_DUMP_INFLOW'
    | 'LARGE_TRANSFER_NEUTRAL';
  marketVerdict:
    | 'BULLISH_ABSORPTION'
    | 'BEARISH_DISTRIBUTION'
    | 'NEUTRAL_REBALANCE';
  spotPrice: number;
  return24hPct: number;
  explanation: string;
  rawExcerpt: string;
  url: string;
  timestamp: string;
  onChainVerified?: boolean;
  txHash?: string;
  blockNumber?: number;
  chainName?: string;
}

export type TradeStrategy =
  | 'KOL_CONVERGENCE'
  | 'ATOMIC_BUY_THE_DIP'
  | 'DEBATE_CONSENSUS';

export interface PracticePosition {
  id: string;
  symbol: string;
  strategy: TradeStrategy;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_TIME' | 'CLOSED_MANUAL';
  entryPrice: number;
  midPriceAtEntry?: number;
  slippageBps?: number;
  spreadBps?: number;
  takerFeeUsd?: number;
  l2DepthUsd?: number;
  orderBookHash?: string;
  currentPrice: number;
  exitPrice?: number;
  exitSlippageBps?: number;
  exitFeeUsd?: number;
  quantity: number;
  notionalUsd: number;
  riskAmountUsd: number;
  riskPctOfEquity: number;
  stopLoss: number;
  takeProfit: number;
  rewardRiskRatio: number;
  timeStopHours: number;
  openedAt: string;
  expiresAt: string;
  closedAt?: string;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  realizedPnlUsd?: number;
  realizedPnlPct?: number;
  convergenceNci?: number;
  debateVerdict?: string;
  openedTrailHash: string;
  closedTrailHash?: string;
  causeAndEffectChain: string[];
  contributingVoices: string[];
  evidenceHashes: string[];
}

export interface SkippedSignalRecord {
  id: string;
  timestamp: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  strategy: TradeStrategy;
  signalStrength: number;
  gateFailed: string;
  detailedReason: string;
  hypotheticalEntry: number;
  trailHash: string;
}

export interface RiskConfig {
  initialEquityUsd: number;
  maxPositionPct: number;
  maxTotalExposurePct: number;
  maxOpenPositions: number;
  riskPerTradePct: number;
  defaultStopLossPct: number;
  defaultTakeProfitPct: number;
  timeStopHours: number;
  tokenCooldownHours: number;
  minConvergenceVoices: number;
  minNciScore: number;
  convergenceWindowHours: number;
  allowShorts: boolean;
  maxCrossVenueSpreadPct: number;
  dailyMaxDrawdownPct: number;
  xBearerToken?: string;
  discordBotToken?: string;
  discordChannelId?: string;
}

export type TrailKind =
  | 'GENESIS'
  | 'MARKET_EVIDENCE'
  | 'ONCHAIN_RPC_EVIDENCE'
  | 'KOL_SIGNAL_BATCH'
  | 'CONVERGENCE_CLUSTER'
  | 'NEWS_VERIFICATION'
  | 'WHALE_VERDICT'
  | 'BULL_BEAR_DEBATE'
  | 'TOKEN_HUNTER_SCREEN'
  | 'PRACTICE_OPEN'
  | 'PRACTICE_REJECTED'
  | 'PRACTICE_CLOSE'
  | 'RISK_CONFIG_UPDATE';

export interface TrailRecord {
  index: number;
  timestamp: string;
  cycleId: string;
  kind: TrailKind;
  summary: string;
  evidenceHashes: string[];
  causedByHash: string | null;
  ruleVersion: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  signature?: string;
  signerPublicKey?: string;
}

export interface VerificationReport {
  valid: boolean;
  checkedRecords: number;
  ed25519SignaturesVerified?: number;
  sqliteSynced?: boolean;
  genesisHash: string | null;
  headHash: string | null;
  brokenAtIndex: number | null;
  errorDetail?: string;
  deterministicReplayChecked: number;
  verifiedAt: string;
}

export interface EquityPoint {
  timestamp: string;
  equityUsd: number;
  cashUsd: number;
  exposureUsd: number;
  cycleId: string;
}

export interface EngineState {
  version: string;
  createdAt: string;
  lastCycleAt: string | null;
  cycleCount: number;
  cashUsd: number;
  realizedPnlUsd: number;
  riskConfig: RiskConfig;
  voices: KOLVoice[];
  markets: MarketSnapshot[];
  signals: ParsedKOLSignal[];
  convergences: ConvergenceCluster[];
  newsVerifications: NewsVerification[];
  debates: BullBearDebate[];
  hunterCandidates: TokenHunterCandidate[];
  whaleVerdicts: WhaleAlertVerdict[];
  positions: PracticePosition[];
  skippedSignals: SkippedSignalRecord[];
  equityHistory: EquityPoint[];
  lastSourceDiagnostics: {
    coinbaseMarketsOk: number;
    krakenPairsOk: number;
    hyperliquidAssetsOk: number;
    l2OrderBooksOk?: number;
    ethBlockNumber?: number;
    ethGasGwei?: number;
    solanaSlot?: number;
    onChainWhaleLogsOk?: number;
    sqliteRowsCount?: number;
    dexScreenerPairsOk: number;
    liveVoicesFetched: number;
    totalRawPostsFetched: number;
    rssItemsFetched: number;
    cycleDurationMs: number;
  };
}
