import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import {
  ATR,
  BollingerBands,
  MACD,
  RSI,
  SMA,
} from 'technicalindicators';
import { hashEvidencePayload } from './crypto-trail';
import { TRACKED_ASSETS, TrackedAssetMeta } from './rulebook';
import {
  KOLVoice,
  L2OrderBookSnapshot,
  MarketSnapshot,
  OrderBookLevel,
  PlatformSource,
  RiskConfig,
  WhaleAlertVerdict,
} from './types';

export interface RawSocialPost {
  voiceId: string;
  voiceName: string;
  handle: string;
  platform: PlatformSource;
  category: KOLVoice['category'];
  trustWeight: number;
  url: string;
  text: string;
  publishedAt: string;
  views?: number;
}

export interface RawNewsItem {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface RawDexPair {
  symbol: string;
  name: string;
  chain: string;
  dexId: string;
  pairAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  buys24h: number;
  sells24h: number;
  change24hPct: number;
  change1hPct: number;
  fdvUsd: number;
  url: string;
}

export interface OnChainRpcTelemetry {
  ethBlockNumber: number;
  ethGasGwei: number;
  solanaSlot: number;
  whaleVerdicts: WhaleAlertVerdict[];
  evidenceHash: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; FriminAutonomousMarketAgent/2.0; +https://dorahacks.io)',
        Accept: 'application/json, text/html, application/xml, text/xml, */*',
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

export function decodeHtmlEntities(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $('br').replaceWith('\n');
  $('p').each((_, el) => {
    $(el).append('\n');
  });
  return $('#root')
    .text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/**
 * Walks a live Level-2 Order Book ladder to compute real Volume-Weighted Execution Price,
 * Bid-Ask Spread, Slippage (in basis points), and Institutional Taker Fee (5 bps).
 */
export function walkOrderBookDepth(params: {
  side: 'BUY' | 'SELL';
  notionalUsd: number;
  book?: L2OrderBookSnapshot;
  fallbackMidPrice: number;
}): {
  fillPrice: number;
  midPrice: number;
  spreadBps: number;
  slippageBps: number;
  takerFeeUsd: number;
  depthUsd: number;
  orderBookHash?: string;
} {
  const TAKER_FEE_RATE = 0.0005; // 5 bps institutional exchange taker fee
  const takerFeeUsd = Number((params.notionalUsd * TAKER_FEE_RATE).toFixed(2));

  if (
    !params.book ||
    params.book.bids.length === 0 ||
    params.book.asks.length === 0
  ) {
    return {
      fillPrice: params.fallbackMidPrice,
      midPrice: params.fallbackMidPrice,
      spreadBps: 1.5,
      slippageBps: 0.8,
      takerFeeUsd,
      depthUsd: 0,
    };
  }

  const levels =
    params.side === 'BUY' ? params.book.asks : params.book.bids;
  let remainingUsd = params.notionalUsd;
  let totalCoins = 0;
  let spentUsd = 0;

  for (const lvl of levels) {
    if (remainingUsd <= 0) break;
    const levelUsdCapacity = lvl.price * lvl.size;
    const takeUsd = Math.min(remainingUsd, levelUsdCapacity);
    const takeCoins = takeUsd / lvl.price;
    spentUsd += takeUsd;
    totalCoins += takeCoins;
    remainingUsd -= takeUsd;
  }

  // If notional exceeds top-50 visible L2 levels, fill remainder at deepest visible level
  if (remainingUsd > 0 && levels.length > 0) {
    const tailPx = levels[levels.length - 1].price;
    spentUsd += remainingUsd;
    totalCoins += remainingUsd / tailPx;
  }

  const rawVwapFill =
    totalCoins > 0 ? spentUsd / totalCoins : params.book.midPrice;
  const fillPrice = Number(rawVwapFill.toPrecision(7));
  const midPrice = params.book.midPrice;
  const slippageBps = Number(
    ((Math.abs(fillPrice - midPrice) / midPrice) * 10_000).toFixed(2)
  );

  return {
    fillPrice,
    midPrice,
    spreadBps: params.book.spreadBps,
    slippageBps,
    takerFeeUsd,
    depthUsd:
      params.side === 'BUY'
        ? params.book.askDepth25Usd
        : params.book.bidDepth25Usd,
    orderBookHash: params.book.orderBookHash,
  };
}

/**
 * Fetches live Level-2 Order Books (top 50 aggregated price levels) from Coinbase Exchange.
 */
export async function fetchLiveOrderBooks(): Promise<
  Map<string, L2OrderBookSnapshot>
> {
  const map = new Map<string, L2OrderBookSnapshot>();
  const observedAt = new Date().toISOString();

  await Promise.all(
    TRACKED_ASSETS.map(async (asset) => {
      try {
        const res = await fetchWithTimeout(
          `https://api.exchange.coinbase.com/products/${asset.coinbaseProduct}/book?level=2`,
          {},
          4500
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          bids?: [string, string, number][];
          asks?: [string, string, number][];
        };
        if (!Array.isArray(data.bids) || !Array.isArray(data.asks)) return;

        const bids: OrderBookLevel[] = data.bids
          .slice(0, 30)
          .map((row) => ({ price: Number(row[0]), size: Number(row[1]) }))
          .filter((r) => r.price > 0 && r.size > 0);
        const asks: OrderBookLevel[] = data.asks
          .slice(0, 30)
          .map((row) => ({ price: Number(row[0]), size: Number(row[1]) }))
          .filter((r) => r.price > 0 && r.size > 0);

        if (bids.length === 0 || asks.length === 0) return;

        const bestBid = bids[0].price;
        const bestAsk = asks[0].price;
        const midPrice = Number(((bestBid + bestAsk) / 2).toPrecision(7));
        const spreadBps = Number(
          (((bestAsk - bestBid) / midPrice) * 10_000).toFixed(2)
        );
        const bidDepth25Usd = Math.round(
          bids.slice(0, 25).reduce((s, b) => s + b.price * b.size, 0)
        );
        const askDepth25Usd = Math.round(
          asks.slice(0, 25).reduce((s, a) => s + a.price * a.size, 0)
        );

        const orderBookHash = hashEvidencePayload({
          symbol: asset.symbol,
          bestBid,
          bestAsk,
          bidDepth25Usd,
          askDepth25Usd,
          top5Bids: bids.slice(0, 5),
          top5Asks: asks.slice(0, 5),
        });

        map.set(asset.symbol, {
          symbol: asset.symbol,
          bestBid,
          bestAsk,
          midPrice,
          spreadBps,
          bidDepth25Usd,
          askDepth25Usd,
          bids,
          asks,
          orderBookHash,
          observedAt,
        });
      } catch {
        // Individual book timeout tolerated
      }
    })
  );

  return map;
}

/**
 * Fetches live cross-checked spot candles, institutional technical indicators (Wilder RSI, Wilder ATR,
 * MACD 12/26/9, Bollinger Bands 20/2, VWAP), Kraken spot ticker, Hyperliquid perps, and L2 Orderbooks.
 */
export async function fetchLiveMarkets(riskConfig: RiskConfig): Promise<{
  snapshots: MarketSnapshot[];
  orderBooks: Map<string, L2OrderBookSnapshot>;
  coinbaseOk: number;
  krakenOk: number;
  hyperliquidOk: number;
  l2OrderBooksOk: number;
}> {
  const observedAt = new Date().toISOString();

  // Fetch L2 Orderbooks concurrently with Kraken & Hyperliquid
  const [orderBooks, krakenMap, hlMap] = await Promise.all([
    fetchLiveOrderBooks(),
    (async () => {
      const m = new Map<string, number>();
      try {
        const pairsQuery = TRACKED_ASSETS.map((a) => a.krakenPair).join(',');
        const krakenRes = await fetchWithTimeout(
          `https://api.kraken.com/0/public/Ticker?pair=${pairsQuery}`,
          {},
          5000
        );
        if (krakenRes.ok) {
          const krakenData = (await krakenRes.json()) as {
            result?: Record<string, { c?: string[] }>;
          };
          if (krakenData.result) {
            for (const asset of TRACKED_ASSETS) {
              const entry =
                krakenData.result[asset.krakenResponseKey] ||
                krakenData.result[asset.krakenPair];
              const lastStr = entry?.c?.[0];
              if (lastStr && Number.isFinite(Number(lastStr))) {
                m.set(asset.symbol, Number(lastStr));
              }
            }
          }
        }
      } catch {
        // Graceful fallback
      }
      return m;
    })(),
    (async () => {
      const m = new Map<
        string,
        { markPx: number; funding8hPct: number; openInterestUsd: number }
      >();
      try {
        const hlRes = await fetchWithTimeout(
          'https://api.hyperliquid.xyz/info',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
          },
          5500
        );
        if (hlRes.ok) {
          const hlJson = (await hlRes.json()) as [
            { universe: { name: string }[] },
            { funding: string; openInterest: string; markPx: string }[]
          ];
          const universe = hlJson?.[0]?.universe ?? [];
          const ctxs = hlJson?.[1] ?? [];
          for (let i = 0; i < Math.min(universe.length, ctxs.length); i++) {
            const name = universe[i].name;
            const ctx = ctxs[i];
            let markPx = Number(ctx.markPx);
            const fundingHourly = Number(ctx.funding);
            const oiCoins = Number(ctx.openInterest);
            if (Number.isFinite(markPx) && markPx > 0) {
              const openInterestUsd = oiCoins * markPx;
              if (name === 'kPEPE') {
                markPx = markPx / 1000;
              }
              m.set(name, {
                markPx,
                funding8hPct: Number((fundingHourly * 8 * 100).toFixed(4)),
                openInterestUsd: Number(openInterestUsd.toFixed(0)),
              });
            }
          }
        }
      } catch {
        // Graceful fallback
      }
      return m;
    })(),
  ]);

  let coinbaseOk = 0;
  const snapshots: MarketSnapshot[] = [];

  const assetPromises = TRACKED_ASSETS.map(async (asset: TrackedAssetMeta) => {
    let candlesAsc: {
      time: number;
      low: number;
      high: number;
      open: number;
      close: number;
      volume: number;
    }[] = [];

    try {
      const cbRes = await fetchWithTimeout(
        `https://api.exchange.coinbase.com/products/${asset.coinbaseProduct}/candles?granularity=3600`,
        {},
        5500
      );
      if (cbRes.ok) {
        const raw = (await cbRes.json()) as number[][];
        if (Array.isArray(raw) && raw.length >= 10) {
          candlesAsc = raw
            .slice(0, 72)
            .map((row) => ({
              time: Number(row[0]),
              low: Number(row[1]),
              high: Number(row[2]),
              open: Number(row[3]),
              close: Number(row[4]),
              volume: Number(row[5]),
            }))
            .filter((c) => Number.isFinite(c.close) && c.close > 0)
            .reverse();
        }
      }
    } catch {
      // Cross-venue fallback below
    }

    const l2Book = orderBooks.get(asset.symbol);
    const coinbasePrice =
      l2Book?.midPrice ??
      (candlesAsc.length > 0 ? candlesAsc[candlesAsc.length - 1].close : null);
    if (coinbasePrice !== null) {
      coinbaseOk++;
    }
    const krakenPrice = krakenMap.get(asset.symbol) ?? null;
    const hlInfo = hlMap.get(asset.hyperliquidSymbol) ?? null;
    const hyperliquidMarkPrice = hlInfo?.markPx ?? null;

    const availablePrices = [
      coinbasePrice,
      krakenPrice,
      hyperliquidMarkPrice,
    ].filter((p): p is number => p !== null && Number.isFinite(p) && p > 0);

    if (availablePrices.length === 0) {
      return null;
    }

    const spotPrice = coinbasePrice ?? krakenPrice ?? hyperliquidMarkPrice!;
    let crossVenueSpreadPct = 0;
    if (availablePrices.length >= 2) {
      const maxP = Math.max(...availablePrices);
      const minP = Math.min(...availablePrices);
      crossVenueSpreadPct = Number((((maxP - minP) / minP) * 100).toFixed(4));
    }
    const crossVenueVerified =
      availablePrices.length >= 2 &&
      crossVenueSpreadPct <= riskConfig.maxCrossVenueSpreadPct;

    const closes =
      candlesAsc.length > 0
        ? candlesAsc.map((c) => c.close)
        : [spotPrice, spotPrice];
    const highs =
      candlesAsc.length > 0 ? candlesAsc.map((c) => c.high) : [spotPrice];
    const lows =
      candlesAsc.length > 0 ? candlesAsc.map((c) => c.low) : [spotPrice];

    const last24 = candlesAsc.slice(-24);
    const open24h =
      last24.length > 0 ? last24[0].open : closes[0] || spotPrice;
    const close6hAgo =
      closes.length >= 7 ? closes[closes.length - 7] : open24h;

    const return24hPct = Number(
      (((spotPrice - open24h) / open24h) * 100).toFixed(2)
    );
    const return6hPct = Number(
      (((spotPrice - close6hAgo) / close6hAgo) * 100).toFixed(2)
    );
    const high24h =
      last24.length > 0
        ? Math.max(...last24.map((c) => c.high))
        : spotPrice * 1.01;
    const low24h =
      last24.length > 0
        ? Math.min(...last24.map((c) => c.low))
        : spotPrice * 0.99;

    const totalBaseVol24 = last24.reduce((acc, c) => acc + c.volume, 0);
    const totalQuoteVol24 = last24.reduce(
      (acc, c) => acc + ((c.high + c.low + c.close) / 3) * c.volume,
      0
    );
    const volume24hUsd = Math.round(totalQuoteVol24);
    const vwap24h = Number(
      (totalBaseVol24 > 0 ? totalQuoteVol24 / totalBaseVol24 : spotPrice).toPrecision(6)
    );

    // Institutional Technical Indicators via `technicalindicators`
    const smaArr = SMA.calculate({ period: 20, values: closes });
    const sma20 = Number(
      (smaArr.length > 0 ? smaArr[smaArr.length - 1] : spotPrice).toPrecision(6)
    );

    const rsiArr = RSI.calculate({ period: 14, values: closes });
    const rsi14 = Number(
      (rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50).toFixed(2)
    );

    const atrArr = ATR.calculate({
      period: 14,
      high: highs,
      low: lows,
      close: closes,
    });
    const atr14Raw = atrArr.length > 0 ? atrArr[atrArr.length - 1] : 0;
    const atr14 = Number(
      (atr14Raw > 0 ? atr14Raw : spotPrice * 0.018).toPrecision(5)
    );
    const atrPct = Number(((atr14 / spotPrice) * 100).toFixed(2));

    const macdArr = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const lastMacd = macdArr.length > 0 ? macdArr[macdArr.length - 1] : undefined;
    const macdHistogram = Number((lastMacd?.histogram ?? 0).toPrecision(4));

    const bbArr = BollingerBands.calculate({
      period: 20,
      values: closes,
      stdDev: 2,
    });
    const lastBb = bbArr.length > 0 ? bbArr[bbArr.length - 1] : undefined;
    const bollingerUpper = Number(
      (lastBb?.upper ?? spotPrice * 1.03).toPrecision(6)
    );
    const bollingerLower = Number(
      (lastBb?.lower ?? spotPrice * 0.97).toPrecision(6)
    );
    const bbSpan = Math.max(1e-9, bollingerUpper - bollingerLower);
    const bollingerPctB = Number(
      ((spotPrice - bollingerLower) / bbSpan).toFixed(3)
    );

    let volumeZScore = 0;
    if (candlesAsc.length >= 12) {
      const vols = candlesAsc.slice(-30).map((c) => c.volume);
      const meanVol = vols.reduce((a, b) => a + b, 0) / vols.length;
      const variance =
        vols.reduce((a, b) => a + Math.pow(b - meanVol, 2), 0) / vols.length;
      const stdVol = Math.sqrt(variance);
      const recentVol =
        vols.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, vols.length);
      if (stdVol > 0) {
        volumeZScore = Number(((recentVol - meanVol) / stdVol).toFixed(2));
      }
    }

    const recent30High =
      candlesAsc.length > 0
        ? Math.max(...candlesAsc.slice(-30).map((c) => c.high))
        : high24h;
    const drawdown30hPct = Number(
      (((recent30High - spotPrice) / recent30High) * 100).toFixed(2)
    );

    const rawEvidencePayload = {
      symbol: asset.symbol,
      observedAt,
      coinbasePrice,
      krakenPrice,
      hyperliquidMarkPrice,
      crossVenueSpreadPct,
      return24hPct,
      vwap24h,
      sma20,
      rsi14,
      macdHistogram,
      bollingerPctB,
      atr14,
      volumeZScore,
      drawdown30hPct,
      fundingRate8hPct: hlInfo?.funding8hPct ?? 0,
      openInterestUsd: hlInfo?.openInterestUsd ?? 0,
      orderBookHash: l2Book?.orderBookHash ?? null,
      last12Closes: closes.slice(-12),
    };

    const snapshot: MarketSnapshot = {
      symbol: asset.symbol,
      name: asset.name,
      spotPrice,
      coinbasePrice,
      krakenPrice,
      hyperliquidMarkPrice,
      crossVenueSpreadPct,
      crossVenueVerified,
      return24hPct,
      return6hPct,
      high24h,
      low24h,
      volume24hUsd,
      vwap24h,
      sma20,
      rsi14,
      macdHistogram,
      bollingerUpper,
      bollingerLower,
      bollingerPctB,
      atr14,
      atrPct,
      volumeZScore,
      drawdown30hPct,
      fundingRate8hPct: hlInfo?.funding8hPct ?? 0,
      openInterestUsd: hlInfo?.openInterestUsd ?? 0,
      bestBid: l2Book?.bestBid,
      bestAsk: l2Book?.bestAsk,
      l2SpreadBps: l2Book?.spreadBps,
      l2BidDepthUsd: l2Book?.bidDepth25Usd,
      l2AskDepthUsd: l2Book?.askDepth25Usd,
      orderBookHash: l2Book?.orderBookHash,
      candlesCloses: closes.slice(-24),
      rawEvidenceHash: hashEvidencePayload(rawEvidencePayload),
      observedAt,
    };
    return snapshot;
  });

  const resolved = await Promise.all(assetPromises);
  for (const snap of resolved) {
    if (snap) snapshots.push(snap);
  }

  return {
    snapshots,
    orderBooks,
    coinbaseOk,
    krakenOk: krakenMap.size,
    hyperliquidOk: hlMap.size,
    l2OrderBooksOk: orderBooks.size,
  };
}

/**
 * Known Exchange Hot Wallets on Ethereum Mainnet for deterministic CEX inflow/outflow classification.
 */
const KNOWN_ETH_CEX_WALLETS: Record<string, string> = {
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance Hot Wallet',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance Hot Wallet',
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance Hot Wallet',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase Custody',
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase Hot Wallet',
  '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase Hot Wallet',
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': 'Kraken Hot Wallet',
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'Okx Hot Wallet',
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': 'Bybit Hot Wallet',
};

const MONITORED_ERC20_CONTRACTS: Record<
  string,
  { symbol: string; decimals: number }
> = {
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'BTC', decimals: 8 }, // WBTC
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'ETH', decimals: 18 }, // WETH
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18 },
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18 },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18 },
  '0x6982508145454ce325ddbe47a25d4ec3d2311933': { symbol: 'PEPE', decimals: 18 },
};

/**
 * Queries Ethereum Mainnet RPC (`eth_blockNumber`, `eth_gasPrice`, `eth_getLogs`)
 * and Solana Mainnet RPC (`getSlot`) directly to verify live on-chain whale transfers!
 */
export async function fetchLiveOnChainTelemetry(
  marketMap: Map<string, MarketSnapshot>
): Promise<OnChainRpcTelemetry> {
  const ethRpc = 'https://ethereum-rpc.publicnode.com';
  const solRpc = 'https://solana-rpc.publicnode.com';
  let ethBlockNumber = 0;
  let ethGasGwei = 0;
  let solanaSlot = 0;
  const whaleVerdicts: WhaleAlertVerdict[] = [];
  const nowIso = new Date().toISOString();

  await Promise.all([
    // 1. Solana Mainnet Slot
    (async () => {
      try {
        const sRes = await fetchWithTimeout(
          solRpc,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getSlot',
            }),
          },
          4000
        );
        if (sRes.ok) {
          const sj = (await sRes.json()) as { result?: number };
          if (typeof sj.result === 'number') solanaSlot = sj.result;
        }
      } catch {
        // Optional
      }
    })(),

    // 2. Ethereum Mainnet Head + Gas + Live ERC-20 Whale `Transfer` Logs
    (async () => {
      try {
        const [bnRes, gasRes] = await Promise.all([
          fetchWithTimeout(
            ethRpc,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_blockNumber',
                params: [],
                id: 1,
              }),
            },
            4000
          ),
          fetchWithTimeout(
            ethRpc,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_gasPrice',
                params: [],
                id: 2,
              }),
            },
            4000
          ),
        ]);

        if (bnRes.ok) {
          const bnj = (await bnRes.json()) as { result?: string };
          if (bnj.result) ethBlockNumber = parseInt(bnj.result, 16);
        }
        if (gasRes.ok) {
          const gasj = (await gasRes.json()) as { result?: string };
          if (gasj.result) {
            ethGasGwei = Number((parseInt(gasj.result, 16) / 1e9).toFixed(2));
          }
        }

        if (ethBlockNumber > 100) {
          const fromHex = '0x' + (ethBlockNumber - 40).toString(16);
          const toHex = '0x' + ethBlockNumber.toString(16);
          const transferTopic =
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

          const logsRes = await fetchWithTimeout(
            ethRpc,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getLogs',
                params: [
                  {
                    fromBlock: fromHex,
                    toBlock: toHex,
                    address: Object.keys(MONITORED_ERC20_CONTRACTS),
                    topics: [transferTopic],
                  },
                ],
                id: 3,
              }),
            },
            5000
          );

          if (logsRes.ok) {
            const lj = (await logsRes.json()) as {
              result?: {
                address: string;
                topics: string[];
                data: string;
                blockNumber: string;
                transactionHash: string;
              }[];
            };

            const logs = lj.result ?? [];
            const candidates: {
              symbol: string;
              usdVal: number;
              amountToken: number;
              fromAddr: string;
              toAddr: string;
              txHash: string;
              blockNum: number;
            }[] = [];

            for (const log of logs) {
              const meta =
                MONITORED_ERC20_CONTRACTS[log.address.toLowerCase()];
              if (!meta || !log.data || log.data === '0x' || log.topics.length < 3)
                continue;
              const snap = marketMap.get(meta.symbol);
              if (!snap) continue;

              let rawBig: bigint;
              try {
                rawBig = BigInt(log.data);
              } catch {
                continue;
              }
              const divisor = Math.pow(10, meta.decimals);
              const amountToken = Number(rawBig) / divisor;
              if (!Number.isFinite(amountToken) || amountToken <= 0) continue;

              const usdVal = amountToken * snap.spotPrice;
              // Keep notable whale transfers >= $50,000 in the last ~8 minutes of blocks
              if (usdVal < 50_000) continue;

              const fromAddr = '0x' + log.topics[1].slice(-40).toLowerCase();
              const toAddr = '0x' + log.topics[2].slice(-40).toLowerCase();
              candidates.push({
                symbol: meta.symbol,
                usdVal: Math.round(usdVal),
                amountToken,
                fromAddr,
                toAddr,
                txHash: log.transactionHash,
                blockNum: parseInt(log.blockNumber, 16),
              });
            }

            candidates.sort((a, b) => b.usdVal - a.usdVal);
            const seenTx = new Set<string>();

            for (const c of candidates) {
              if (seenTx.has(c.txHash)) continue;
              seenTx.add(c.txHash);
              const snap = marketMap.get(c.symbol)!;
              const fromCex = KNOWN_ETH_CEX_WALLETS[c.fromAddr];
              const toCex = KNOWN_ETH_CEX_WALLETS[c.toAddr];

              let flowType: WhaleAlertVerdict['flowType'] =
                'LARGE_TRANSFER_NEUTRAL';
              let marketVerdict: WhaleAlertVerdict['marketVerdict'] =
                'NEUTRAL_REBALANCE';
              let explanation = '';

              const shortFrom =
                fromCex ?? `${c.fromAddr.slice(0, 6)}...${c.fromAddr.slice(-4)}`;
              const shortTo =
                toCex ?? `${c.toAddr.slice(0, 6)}...${c.toAddr.slice(-4)}`;

              if (fromCex && !toCex) {
                flowType = 'ACCUMULATION_OUTFLOW';
                marketVerdict = 'BULLISH_ABSORPTION';
                explanation = `Direct Ethereum Mainnet block #${c.blockNum}: $${c.usdVal.toLocaleString()} withdrawn from ${fromCex} to private custody (${shortTo}), reducing liquid exchange supply.`;
              } else if (!fromCex && toCex) {
                flowType = 'EXCHANGE_DUMP_INFLOW';
                marketVerdict = 'BEARISH_DISTRIBUTION';
                explanation = `Direct Ethereum Mainnet block #${c.blockNum}: $${c.usdVal.toLocaleString()} deposited from ${shortFrom} into ${toCex}, increasing immediate sell-side orderbook supply.`;
              } else {
                flowType = 'LARGE_TRANSFER_NEUTRAL';
                marketVerdict = 'NEUTRAL_REBALANCE';
                explanation = `Direct Ethereum Mainnet block #${c.blockNum}: $${c.usdVal.toLocaleString()} settled on-chain (${shortFrom} → ${shortTo}) while spot trades at $${snap.spotPrice.toLocaleString()}.`;
              }

              const postHash = hashEvidencePayload({
                txHash: c.txHash,
                blockNum: c.blockNum,
                symbol: c.symbol,
                usdVal: c.usdVal,
              });

              whaleVerdicts.push({
                id: `rpc-whale-${c.txHash.slice(2, 10)}`,
                postHash,
                sourceName: 'Ethereum Mainnet Rpc',
                handle: `block-${c.blockNum}`,
                symbol: c.symbol,
                estimatedUsd: c.usdVal,
                flowType,
                marketVerdict,
                spotPrice: snap.spotPrice,
                return24hPct: snap.return24hPct,
                explanation,
                rawExcerpt: `On-chain ERC-20 transfer of ${c.amountToken.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c.symbol} ($${c.usdVal.toLocaleString()}) in block #${c.blockNum} (${shortFrom} → ${shortTo}).`,
                url: `https://etherscan.io/tx/${c.txHash}`,
                timestamp: nowIso,
                onChainVerified: true,
                txHash: c.txHash,
                blockNumber: c.blockNum,
                chainName: 'Ethereum',
              });

              if (whaleVerdicts.length >= 8) break;
            }
          }
        }
      } catch {
        // Graceful fallback
      }
    })(),
  ]);

  const evidenceHash = hashEvidencePayload({
    ethBlockNumber,
    ethGasGwei,
    solanaSlot,
    whaleCount: whaleVerdicts.length,
    txHashes: whaleVerdicts.map((w) => w.txHash),
  });

  return {
    ethBlockNumber,
    ethGasGwei,
    solanaSlot,
    whaleVerdicts,
    evidenceHash,
  };
}

/**
 * Parses public Telegram channel web preview HTML using `cheerio` DOM parser.
 */
function parseTelegramChannelHtml(
  html: string,
  voice: KOLVoice
): RawSocialPost[] {
  const posts: RawSocialPost[] = [];
  const $ = cheerio.load(html);
  const wraps = $('.tgme_widget_message_wrap').toArray();
  const tailWraps = wraps.slice(Math.max(0, wraps.length - 12));

  for (const el of tailWraps) {
    const msgEl = $(el).find('.tgme_widget_message');
    const postSlug = msgEl.attr('data-post') || voice.handle;
    const textHtml = $(el).find('.tgme_widget_message_text').first().html();
    const timeIsoAttr = $(el)
      .find('.tgme_widget_message_date time')
      .attr('datetime');
    const viewsStr = $(el)
      .find('.tgme_widget_message_views')
      .first()
      .text()
      .trim();

    if (!textHtml || !timeIsoAttr) continue;
    const cleanText = decodeHtmlEntities(textHtml);
    if (cleanText.length < 12) continue;

    let views: number | undefined;
    if (viewsStr) {
      const upper = viewsStr.toUpperCase();
      if (upper.endsWith('K')) views = Math.round(parseFloat(upper) * 1000);
      else if (upper.endsWith('M'))
        views = Math.round(parseFloat(upper) * 1_000_000);
      else if (Number.isFinite(Number(upper))) views = Number(upper);
    }

    const parsedDate = new Date(timeIsoAttr);
    if (Number.isNaN(parsedDate.getTime())) continue;

    posts.push({
      voiceId: voice.id,
      voiceName: voice.name,
      handle: voice.handle,
      platform: voice.platform,
      category: voice.category,
      trustWeight: voice.dynamicTrust,
      url: `https://t.me/${postSlug}`,
      text: cleanText.slice(0, 1200),
      publishedAt: parsedDate.toISOString(),
      views,
    });
  }

  return posts;
}

/**
 * Parses RSS 2.0 and Atom XML feeds using `fast-xml-parser`.
 */
function parseRssXml(xml: string, defaultSource: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  try {
    const parsed = xmlParser.parse(xml) as Record<string, unknown>;
    const rssChannel = (parsed?.rss as Record<string, unknown>)?.channel as
      | Record<string, unknown>
      | undefined;
    const atomFeed = parsed?.feed as Record<string, unknown> | undefined;

    const rawEntries = rssChannel?.item ?? atomFeed?.entry ?? [];
    const list = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

    for (const raw of list.slice(0, 14)) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;

      const titleVal =
        typeof obj.title === 'string'
          ? obj.title
          : (obj.title as Record<string, unknown>)?.['#text'] ?? '';
      const descVal =
        typeof obj.description === 'string'
          ? obj.description
          : typeof obj.summary === 'string'
          ? obj.summary
          : (obj.description as Record<string, unknown>)?.['#text'] ?? '';

      let linkVal = '';
      if (typeof obj.link === 'string') {
        linkVal = obj.link;
      } else if (obj.link && typeof obj.link === 'object') {
        linkVal = String(
          (obj.link as Record<string, unknown>)['@_href'] ?? ''
        );
      }

      const pubRaw = String(
        obj.pubDate ?? obj.published ?? obj.updated ?? obj['dc:date'] ?? ''
      );

      const title = decodeHtmlEntities(String(titleVal));
      const description = decodeHtmlEntities(String(descVal)).slice(0, 400);
      const url = linkVal.trim();
      if (!title || !url) continue;

      let publishedAt = new Date().toISOString();
      if (pubRaw) {
        const dt = new Date(pubRaw);
        if (!Number.isNaN(dt.getTime())) publishedAt = dt.toISOString();
      }

      items.push({
        title,
        description,
        source: defaultSource,
        url,
        publishedAt,
      });
    }
  } catch {
    // Malformed XML skipped cleanly
  }
  return items;
}

/**
 * Fetches live posts across up to 20 user-selected KOLs & Market Voices.
 */
export async function fetchLiveKOLsAndNews(
  voices: KOLVoice[],
  riskConfig: RiskConfig
): Promise<{
  posts: RawSocialPost[];
  newsItems: RawNewsItem[];
  updatedVoices: KOLVoice[];
  liveVoicesCount: number;
}> {
  const activeVoices = voices.filter((v) => v.enabled).slice(0, 20);
  const allPosts: RawSocialPost[] = [];
  const allNews: RawNewsItem[] = [];
  let liveVoicesCount = 0;

  const updatedVoicesMap = new Map<string, KOLVoice>(
    voices.map((v) => [v.id, { ...v }])
  );

  await Promise.all(
    activeVoices.map(async (voice) => {
      const nowIso = new Date().toISOString();
      try {
        if (voice.platform === 'Telegram') {
          const handleClean = voice.handle.replace(/^@/, '').trim();
          const url = voice.feedUrl?.startsWith('https://t.me/s/')
            ? voice.feedUrl
            : `https://t.me/s/${handleClean}`;
          const res = await fetchWithTimeout(url, {}, 5500);
          if (res.ok) {
            const html = await res.text();
            const parsed = parseTelegramChannelHtml(html, voice);
            if (parsed.length > 0) {
              liveVoicesCount++;
              allPosts.push(...parsed);
              updatedVoicesMap.set(voice.id, {
                ...voice,
                lastSyncedAt: nowIso,
                lastPostCount: parsed.length,
                syncStatus: 'LIVE',
              });
              return;
            }
          }
          updatedVoicesMap.set(voice.id, {
            ...voice,
            lastSyncedAt: nowIso,
            syncStatus: 'DEGRADED',
          });
        } else if (voice.platform === 'ResearchRSS') {
          const res = await fetchWithTimeout(voice.feedUrl, {}, 5500);
          if (res.ok) {
            const xml = await res.text();
            const rssItems = parseRssXml(xml, voice.name);
            if (rssItems.length > 0) {
              liveVoicesCount++;
              allNews.push(...rssItems);
              const asPosts: RawSocialPost[] = rssItems
                .slice(0, 8)
                .map((item) => ({
                  voiceId: voice.id,
                  voiceName: voice.name,
                  handle: voice.handle,
                  platform: 'ResearchRSS',
                  category: voice.category,
                  trustWeight: voice.dynamicTrust,
                  url: item.url,
                  text: `${item.title}. ${item.description}`.trim(),
                  publishedAt: item.publishedAt,
                }));
              allPosts.push(...asPosts);
              updatedVoicesMap.set(voice.id, {
                ...voice,
                lastSyncedAt: nowIso,
                lastPostCount: asPosts.length,
                syncStatus: 'LIVE',
              });
              return;
            }
          }
          updatedVoicesMap.set(voice.id, {
            ...voice,
            lastSyncedAt: nowIso,
            syncStatus: 'DEGRADED',
          });
        } else if (voice.platform === 'X') {
          const handleClean = voice.handle.replace(/^@/, '').trim();
          if (riskConfig.xBearerToken && riskConfig.xBearerToken.trim()) {
            const token = riskConfig.xBearerToken.trim();
            const userRes = await fetchWithTimeout(
              `https://api.twitter.com/2/users/by/username/${encodeURIComponent(
                handleClean
              )}`,
              { headers: { Authorization: `Bearer ${token}` } },
              5000
            );
            if (userRes.ok) {
              const userJson = (await userRes.json()) as {
                data?: { id?: string };
              };
              const userId = userJson.data?.id;
              if (userId) {
                const tweetsRes = await fetchWithTimeout(
                  `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics`,
                  { headers: { Authorization: `Bearer ${token}` } },
                  5000
                );
                if (tweetsRes.ok) {
                  const tweetsJson = (await tweetsRes.json()) as {
                    data?: {
                      id: string;
                      text: string;
                      created_at?: string;
                      public_metrics?: { impression_count?: number };
                    }[];
                  };
                  const tweets = tweetsJson.data ?? [];
                  const mapped: RawSocialPost[] = tweets.map((t) => ({
                    voiceId: voice.id,
                    voiceName: voice.name,
                    handle: `@${handleClean}`,
                    platform: 'X',
                    category: voice.category,
                    trustWeight: voice.dynamicTrust,
                    url: `https://x.com/${handleClean}/status/${t.id}`,
                    text: t.text,
                    publishedAt: t.created_at ?? nowIso,
                    views: t.public_metrics?.impression_count,
                  }));
                  liveVoicesCount++;
                  allPosts.push(...mapped);
                  updatedVoicesMap.set(voice.id, {
                    ...voice,
                    lastSyncedAt: nowIso,
                    lastPostCount: mapped.length,
                    syncStatus: 'LIVE',
                  });
                  return;
                }
              }
            }
          }
          updatedVoicesMap.set(voice.id, {
            ...voice,
            lastSyncedAt: nowIso,
            syncStatus: 'AWAITING_TOKEN',
          });
        } else if (voice.platform === 'Discord') {
          const channelId = voice.handle.trim() || riskConfig.discordChannelId;
          if (
            riskConfig.discordBotToken &&
            riskConfig.discordBotToken.trim() &&
            channelId
          ) {
            const dRes = await fetchWithTimeout(
              `https://discord.com/api/v10/channels/${encodeURIComponent(
                channelId
              )}/messages?limit=12`,
              {
                headers: {
                  Authorization: `Bot ${riskConfig.discordBotToken.trim()}`,
                },
              },
              5000
            );
            if (dRes.ok) {
              const msgs = (await dRes.json()) as {
                id: string;
                content: string;
                timestamp: string;
              }[];
              const mapped: RawSocialPost[] = msgs
                .filter((m) => m.content && m.content.length >= 10)
                .map((m) => ({
                  voiceId: voice.id,
                  voiceName: voice.name,
                  handle: voice.handle,
                  platform: 'Discord',
                  category: voice.category,
                  trustWeight: voice.dynamicTrust,
                  url: `https://discord.com/channels/@me/${channelId}/${m.id}`,
                  text: m.content,
                  publishedAt: new Date(m.timestamp).toISOString(),
                }));
              liveVoicesCount++;
              allPosts.push(...mapped);
              updatedVoicesMap.set(voice.id, {
                ...voice,
                lastSyncedAt: nowIso,
                lastPostCount: mapped.length,
                syncStatus: 'LIVE',
              });
              return;
            }
          }
          updatedVoicesMap.set(voice.id, {
            ...voice,
            lastSyncedAt: nowIso,
            syncStatus: 'AWAITING_TOKEN',
          });
        }
      } catch {
        updatedVoicesMap.set(voice.id, {
          ...voice,
          lastSyncedAt: nowIso,
          syncStatus: 'DEGRADED',
        });
      }
    })
  );

  const seenNewsUrls = new Set<string>();
  const uniqueNews: RawNewsItem[] = [];
  for (const n of allNews) {
    if (!seenNewsUrls.has(n.url)) {
      seenNewsUrls.add(n.url);
      uniqueNews.push(n);
    }
  }

  return {
    posts: allPosts,
    newsItems: uniqueNews,
    updatedVoices: voices.map((v) => updatedVoicesMap.get(v.id) ?? v),
    liveVoicesCount,
  };
}

/**
 * Fetches live on-chain DEX pairs via DexScreener public API.
 */
export async function fetchLiveDexCandidates(): Promise<RawDexPair[]> {
  const candidates: RawDexPair[] = [];
  try {
    const searchQueries = [
      'SOL',
      'PEPE',
      'BONK',
      'JUP',
      'WIF',
      'VIRTUAL',
      'AAVE',
      'AERO',
    ];
    const seenPairs = new Set<string>();

    let boostedAddresses: { chainId: string; tokenAddress: string }[] = [];
    try {
      const boostRes = await fetchWithTimeout(
        'https://api.dexscreener.com/token-boosts/top/v1',
        {},
        4500
      );
      if (boostRes.ok) {
        const boostJson = (await boostRes.json()) as {
          chainId?: string;
          tokenAddress?: string;
        }[];
        if (Array.isArray(boostJson)) {
          boostedAddresses = boostJson
            .filter((b) => b.tokenAddress && b.chainId)
            .slice(0, 6)
            .map((b) => ({
              chainId: b.chainId!,
              tokenAddress: b.tokenAddress!,
            }));
        }
      }
    } catch {
      // Optional
    }

    const boostLookups = boostedAddresses.map(async (b) => {
      try {
        const r = await fetchWithTimeout(
          `https://api.dexscreener.com/latest/dex/tokens/${b.tokenAddress}`,
          {},
          4000
        );
        if (!r.ok) return [];
        const d = (await r.json()) as { pairs?: Record<string, unknown>[] };
        return d.pairs?.slice(0, 1) ?? [];
      } catch {
        return [];
      }
    });

    const queryLookups = searchQueries.slice(0, 6).map(async (q) => {
      try {
        const r = await fetchWithTimeout(
          `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(
            q
          )}`,
          {},
          4500
        );
        if (!r.ok) return [];
        const d = (await r.json()) as { pairs?: Record<string, unknown>[] };
        return d.pairs?.slice(0, 2) ?? [];
      } catch {
        return [];
      }
    });

    const allGroups = await Promise.all([...boostLookups, ...queryLookups]);
    const seenSymbols = new Set<string>();

    for (const group of allGroups) {
      for (const p of group) {
        const pairAddr = String(p.pairAddress || '');
        const baseToken = (p.baseToken || {}) as {
          symbol?: string;
          name?: string;
        };
        const sym = String(baseToken.symbol || '').toUpperCase();
        if (
          !pairAddr ||
          !sym ||
          seenPairs.has(pairAddr) ||
          seenSymbols.has(sym)
        )
          continue;

        const priceUsd = Number(p.priceUsd || 0);
        const liqObj = (p.liquidity || {}) as { usd?: number };
        const volObj = (p.volume || {}) as { h24?: number };
        const txnsObj = (p.txns || {}) as {
          h24?: { buys?: number; sells?: number };
        };
        const chgObj = (p.priceChange || {}) as {
          h24?: number;
          h1?: number;
        };

        if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;

        seenPairs.add(pairAddr);
        seenSymbols.add(sym);

        candidates.push({
          symbol: sym,
          name: String(baseToken.name || sym),
          chain: String(p.chainId || 'unknown'),
          dexId: String(p.dexId || 'dex'),
          pairAddress: pairAddr,
          priceUsd,
          liquidityUsd: Number(liqObj.usd || 0),
          volume24hUsd: Number(volObj.h24 || 0),
          buys24h: Number(txnsObj.h24?.buys || 0),
          sells24h: Number(txnsObj.h24?.sells || 0),
          change24hPct: Number(chgObj.h24 || 0),
          change1hPct: Number(chgObj.h1 || 0),
          fdvUsd: Number(p.fdv || 0),
          url: String(p.url || 'https://dexscreener.com'),
        });

        if (candidates.length >= 12) break;
      }
      if (candidates.length >= 12) break;
    }
  } catch {
    // Graceful fallback
  }
  return candidates;
}
