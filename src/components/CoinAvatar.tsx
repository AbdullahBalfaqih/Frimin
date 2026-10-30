'use client';

import React, { useState } from 'react';

const KNOWN_LOCAL_COINS = new Set([
  'btc',
  'eth',
  'sol',
  'link',
  'avax',
  'sui',
  'doge',
  'xrp',
  'aave',
  'near',
  'uni',
  'arb',
  'pepe',
  'render',
  'bonk',
  'jup',
  'wif',
]);

export const COIN_DISPLAY_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  LINK: 'Chainlink',
  AVAX: 'Avalanche',
  SUI: 'Sui',
  DOGE: 'Dogecoin',
  XRP: 'Ripple',
  AAVE: 'Aave',
  NEAR: 'Near Protocol',
  UNI: 'Uniswap',
  ARB: 'Arbitrum',
  PEPE: 'Pepe',
  RENDER: 'Render',
  BONK: 'Bonk',
  JUP: 'Jupiter',
  WIF: 'Dogwifhat',
};

export function formatCoinTitle(symbol: string, fallbackName?: string): string {
  const upper = symbol.trim().replace(/^\$/, '').toUpperCase();
  if (COIN_DISPLAY_NAMES[upper]) return COIN_DISPLAY_NAMES[upper];
  if (fallbackName && fallbackName.trim().length > 1) {
    return formatCleanText(fallbackName.trim());
  }
  if (!upper) return '';
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

export function formatTickerClean(symbol: string): string {
  const s = symbol.trim().replace(/^\$/, '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Ensures zero all-caps words appear anywhere in UI text,
 * converting raw enum constants, tickers, and acronyms into natural Title/Sentence case.
 */
export function formatCleanText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/\bPRACTICE_OPEN\b/g, 'Practice open')
    .replace(/\bPRACTICE_CLOSE\b/g, 'Practice settled')
    .replace(/\bPRACTICE_REJECTED\b/g, 'Risk gate')
    .replace(/\bCONVERGENCE_CLUSTER\b/g, 'Voice convergence')
    .replace(/\bBULL_BEAR_DEBATE\b/g, 'Market debate')
    .replace(/\bTOKEN_HUNTER_SCREEN\b/g, 'Token scanner')
    .replace(/\bNEWS_VERIFICATION\b/g, 'News check')
    .replace(/\bWHALE_VERDICT\b/g, 'Whale flow')
    .replace(/\bMARKET_EVIDENCE\b/g, 'Market snapshot')
    .replace(/\bONCHAIN_RPC_EVIDENCE\b/g, 'On-chain telemetry')
    .replace(/\bKOL_CONVERGENCE\b/g, 'Voice convergence')
    .replace(/\bATOMIC_BUY_THE_DIP\b/g, 'Dip entry')
    .replace(/\bDEBATE_CONSENSUS\b/g, 'Judge consensus')
    .replace(/\bRISK_ON_LONG\b/g, 'Bullish edge')
    .replace(/\bRISK_OFF_SHORT\b/g, 'Bearish edge')
    .replace(/\bSTAND_ASIDE_NEUTRAL\b/g, 'Neutral')
    .replace(/\bBULLISH_ABSORPTION\b/g, 'Custody accumulation')
    .replace(/\bBEARISH_DISTRIBUTION\b/g, 'Exchange inflow')
    .replace(/\bQUALIFIED\b/g, 'Qualified')
    .replace(/\bMONITORING\b/g, 'Watching')
    .replace(/\bSELECTED\b/g, 'Selected')
    .replace(/\bREJECTED\b/g, 'Filtered')
    .replace(/\bLONG\b/g, 'Long')
    .replace(/\bSHORT\b/g, 'Short')
    .replace(/\bNCI\b/g, 'Score')
    .replace(/\bKOLs\b/g, 'Creators')
    .replace(/\bKOL\b/g, 'Creator')
    .replace(/\bSL\b/g, 'Stop')
    .replace(/\bTP\b/g, 'Target')
    .replace(/\$?BTC\b/g, 'Bitcoin')
    .replace(/\$?ETH\b/g, 'Ethereum')
    .replace(/\$?SOL\b/g, 'Solana')
    .replace(/\$?LINK\b/g, 'Chainlink')
    .replace(/\$?AVAX\b/g, 'Avalanche')
    .replace(/\$?SUI\b/g, 'Sui')
    .replace(/\$?DOGE\b/g, 'Dogecoin')
    .replace(/\$?XRP\b/g, 'Ripple')
    .replace(/\$?AAVE\b/g, 'Aave')
    .replace(/\$?NEAR\b/g, 'Near')
    .replace(/\$?UNI\b/g, 'Uniswap')
    .replace(/\$?ARB\b/g, 'Arbitrum')
    .replace(/\$?PEPE\b/g, 'Pepe')
    .replace(/\$?RENDER\b/g, 'Render')
    .replace(/\$?BONK\b/g, 'Bonk')
    .replace(/\$?JUP\b/g, 'Jupiter')
    .replace(/\$?WIF\b/g, 'Dogwifhat')
    .replace(/_/g, ' ')
    .replace(/\b([A-Z])([A-Z]+)\b/g, (_, first: string, rest: string) => {
      return first + rest.toLowerCase();
    });
}

interface CoinAvatarProps {
  symbol: string;
  size?: number;
  className?: string;
  darkBg?: boolean;
}

export function CoinAvatar({
  symbol,
  size = 36,
  className = '',
  darkBg = false,
}: CoinAvatarProps) {
  const lower = symbol.toLowerCase().replace(/^\$/, '');
  const hasLocal = KNOWN_LOCAL_COINS.has(lower);
  const [imgFailed, setImgFailed] = useState(false);

  if (hasLocal && !imgFailed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center ${
          darkBg
            ? 'bg-white/10 ring-1 ring-white/15'
            : 'bg-white ring-1 ring-black/[0.06]'
        } ${className}`}
      >
        <img
          src={`/coins/${lower}.png`}
          alt={formatCoinTitle(symbol)}
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Crisp Apple-style circular monogram fallback for newly discovered Dex pairs
  const label = formatTickerClean(symbol).slice(0, 3);
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold select-none ${
        darkBg
          ? 'bg-white/15 text-white ring-1 ring-white/15'
          : 'bg-[#111214] text-white'
      } ${className}`}
    >
      {label}
    </div>
  );
}
