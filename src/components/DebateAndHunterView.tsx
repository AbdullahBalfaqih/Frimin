'use client';

import React, { useState } from 'react';
import {
  SFArrowUpRight,
  SFCheckCircle,
  SFXCircle,
} from './AppleIcons';
import { CoinAvatar, formatCleanText, formatCoinTitle } from './CoinAvatar';
import { InspectSubject } from './InspectDrawer';
import { EngineState } from '@/lib/types';

interface DebateAndHunterViewProps {
  state: EngineState;
  lang: 'en' | 'ar';
  searchQuery: string;
  initialSubTab?: 'debate' | 'hunter' | 'news' | 'whale';
  onInspect: (s: InspectSubject) => void;
}

function formatVerdictClean(v: string): string {
  if (v === 'RISK_ON_LONG') return 'Bullish edge · Long';
  if (v === 'RISK_OFF_SHORT') return 'Bearish edge · Short';
  return 'Neutral · Stand aside';
}

export function DebateAndHunterView({
  state,
  lang,
  searchQuery,
  initialSubTab = 'debate',
  onInspect,
}: DebateAndHunterViewProps) {
  const isAr = lang === 'ar';
  const q = searchQuery.trim().toLowerCase();
  const [subTab, setSubTab] = useState<'debate' | 'hunter' | 'news' | 'whale'>(
    initialSubTab
  );

  const filteredDebates = state.debates.filter((d) =>
    q
      ? d.symbol.toLowerCase().includes(q) ||
        formatCoinTitle(d.symbol).toLowerCase().includes(q)
      : true
  );
  const filteredHunter = state.hunterCandidates.filter((c) =>
    q
      ? c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
      : true
  );
  const filteredNews = state.newsVerifications.filter((n) =>
    q
      ? n.title.toLowerCase().includes(q) ||
        n.linkedAssetSymbol.toLowerCase().includes(q)
      : true
  );
  const filteredWhales = state.whaleVerdicts.filter((w) =>
    q
      ? w.symbol.toLowerCase().includes(q) ||
        w.rawExcerpt.toLowerCase().includes(q)
      : true
  );

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5">
      {/* Clean Apple-style Pill Sub-Switch */}
      <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-full border border-[#EFEFF2] w-fit">
        <button
          onClick={() => setSubTab('debate')}
          className={`px-4 py-2 rounded-full text-[13px] transition ${
            subTab === 'debate'
              ? 'bg-[#111214] text-white font-medium'
              : 'text-[#555962] hover:text-[#111214]'
          }`}
        >
          {isAr ? 'مناظرة الصعود والهبوط' : 'Bull & bear debate'} (
          {filteredDebates.length})
        </button>

        <button
          onClick={() => setSubTab('hunter')}
          className={`px-4 py-2 rounded-full text-[13px] transition ${
            subTab === 'hunter'
              ? 'bg-[#111214] text-white font-medium'
              : 'text-[#555962] hover:text-[#111214]'
          }`}
        >
          {isAr ? 'صائد العملات' : 'Token scanner'} ({filteredHunter.length})
        </button>

        <button
          onClick={() => setSubTab('news')}
          className={`px-4 py-2 rounded-full text-[13px] transition ${
            subTab === 'news'
              ? 'bg-[#111214] text-white font-medium'
              : 'text-[#555962] hover:text-[#111214]'
          }`}
        >
          {isAr ? 'مدقق الأخبار' : 'News verifier'} ({filteredNews.length})
        </button>

        <button
          onClick={() => setSubTab('whale')}
          className={`px-4 py-2 rounded-full text-[13px] transition ${
            subTab === 'whale'
              ? 'bg-[#111214] text-white font-medium'
              : 'text-[#555962] hover:text-[#111214]'
          }`}
        >
          {isAr ? 'حركة الحيتان' : 'Whale tracker'} ({filteredWhales.length})
        </button>
      </div>

      {/* 1. Bull / Bear Debate + Judge */}
      {subTab === 'debate' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredDebates.map((d) => {
            const totalPts = Math.max(0.01, d.bullTotalScore + d.bearTotalScore);
            const bullWidthPct = Math.round((d.bullTotalScore / totalPts) * 100);

            return (
              <div
                key={d.id}
                onClick={() => onInspect({ type: 'debate', data: d })}
                className="cursor-pointer bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] hover:border-[#111214] transition space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CoinAvatar symbol={d.symbol} size={40} />
                    <div>
                      <div className="text-[16px] font-medium text-[#111214]">
                        {formatCoinTitle(d.symbol)}
                      </div>
                      <div className="text-[12px] text-[#8D929C] tabular-nums">
                        ${d.spotPrice.toLocaleString()} ·{' '}
                        {d.sharedEvidenceHashes.length} shared evidence records
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium ${
                      d.judgeVerdict === 'RISK_ON_LONG'
                        ? 'bg-[#CBFB00] text-[#111214]'
                        : d.judgeVerdict === 'RISK_OFF_SHORT'
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#F5F6F8] text-[#555962]'
                    }`}
                  >
                    {formatVerdictClean(d.judgeVerdict)}
                  </span>
                </div>

                <div className="tabular-nums">
                  <div className="flex justify-between text-[12px] font-medium mb-1.5">
                    <span className="text-emerald-700">
                      Bull agent · {d.bullTotalScore}
                    </span>
                    <span className="text-rose-700">
                      Bear agent · {d.bearTotalScore}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-rose-100 overflow-hidden flex">
                    <div
                      style={{ width: `${bullWidthPct}%` }}
                      className="h-full bg-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                  <div className="p-4 rounded-[20px] bg-[#FAFAFB] border border-[#F0F1F4] space-y-2">
                    {d.bullArguments.slice(0, 3).map((a, idx) => (
                      <div key={idx}>
                        <div className="font-medium text-emerald-800 tabular-nums">
                          +{a.weight} · {formatCleanText(a.metricValue)}
                        </div>
                        <div className="text-[#555962] text-[11.5px] mt-0.5">
                          {formatCleanText(a.claim)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-[20px] bg-[#FAFAFB] border border-[#F0F1F4] space-y-2">
                    {d.bearArguments.slice(0, 3).map((a, idx) => (
                      <div key={idx}>
                        <div className="font-medium text-rose-800 tabular-nums">
                          -{a.weight} · {formatCleanText(a.metricValue)}
                        </div>
                        <div className="text-[#555962] text-[11.5px] mt-0.5">
                          {formatCleanText(a.claim)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-[20px] bg-[#0B0C0E] text-white text-[12.5px] leading-relaxed">
                  <span className="text-[#CBFB00] font-medium">Judge verdict: </span>
                  {formatCleanText(d.judgeRationale)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Meme / Token Hunter */}
      {subTab === 'hunter' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHunter.map((c) => (
            <div
              key={c.pairAddress}
              className="rounded-[26px] p-6 border border-[#EFEFF2] bg-white space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CoinAvatar symbol={c.symbol} size={38} />
                  <div>
                    <div className="text-[15px] font-medium text-[#111214]">
                      {formatCoinTitle(c.symbol, c.name)}
                    </div>
                    <div className="text-[11.5px] text-[#8D929C] tabular-nums">
                      {c.chain.charAt(0).toUpperCase() + c.chain.slice(1)} · $
                      {c.priceUsd < 0.01
                        ? c.priceUsd.toFixed(6)
                        : c.priceUsd.toFixed(3)}{' '}
                      ·{' '}
                      <span
                        className={
                          c.change24hPct >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }
                      >
                        {c.change24hPct >= 0 ? '+' : ''}
                        {c.change24hPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-[11.5px] font-medium ${
                    c.selected
                      ? 'bg-[#CBFB00] text-[#111214]'
                      : 'bg-rose-50 text-rose-700'
                  }`}
                >
                  {c.selected ? 'Selected' : 'Filtered'}
                </span>
              </div>

              <div className="space-y-2 tabular-nums">
                {c.gates.map((g, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[11.5px] py-1 border-b border-[#F4F5F7] last:border-none"
                  >
                    <span className="flex items-center gap-2 text-[#4F535B]">
                      {g.passed ? (
                        <SFCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <SFXCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                      {formatCleanText(g.gate)}
                    </span>
                    <span className="text-[#111214] font-medium">
                      {formatCleanText(g.actual)}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[12px] text-[#4F535B] bg-[#F5F6F8] p-3.5 rounded-[18px] leading-relaxed">
                {formatCleanText(c.verdictExplanation)}
              </p>

              <div className="flex items-center justify-between text-[11px] text-[#8D929C]">
                <span className="font-mono">
                  Hash {c.evidenceHash.slice(0, 12)}...
                </span>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#111214] hover:underline inline-flex items-center gap-1"
                >
                  Pair details <SFArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. News Checker */}
      {subTab === 'news' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredNews.map((n) => (
            <div
              key={n.id}
              className="bg-white rounded-[26px] p-6 border border-[#EFEFF2] space-y-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CoinAvatar symbol={n.linkedAssetSymbol} size={36} />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11.5px] font-medium text-[#111214]">
                        {n.source}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                          n.storySentiment === 'POSITIVE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : n.storySentiment === 'NEGATIVE'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-[#F5F6F8] text-[#555962]'
                        }`}
                      >
                        {n.storySentiment === 'POSITIVE'
                          ? 'Constructive'
                          : n.storySentiment === 'NEGATIVE'
                          ? 'Risk alert'
                          : 'Neutral'}
                      </span>
                    </div>
                    <h4 className="text-[14px] font-medium text-[#111214] leading-snug">
                      {formatCleanText(n.title)}
                    </h4>
                  </div>
                </div>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-8 h-8 rounded-full border border-[#ECEEF1] flex items-center justify-center text-[#555962] hover:text-[#111214] shrink-0"
                >
                  <SFArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-3.5 rounded-[18px] bg-[#F5F6F8] text-[12px] text-[#22252B] leading-relaxed">
                <strong>Cause & market evidence: </strong>
                {formatCleanText(n.causeAndEffect)}
              </div>

              <p className="text-[12px] text-[#555962] leading-relaxed">
                <strong className="text-[#111214]">Impact: </strong>
                {formatCleanText(n.cryptoImpact)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 4. Whale Movement Tracker */}
      {subTab === 'whale' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWhales.length === 0 ? (
            <div className="col-span-2 bg-white rounded-[26px] p-8 border border-[#EFEFF2] text-center text-[13px] text-[#8D929C]">
              No large wallet movements matched the current search filter.
            </div>
          ) : (
            filteredWhales.map((w) => (
              <div
                key={w.id}
                className="bg-white rounded-[26px] p-6 border border-[#EFEFF2] space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CoinAvatar symbol={w.symbol} size={36} />
                    <div>
                      <div className="text-[14px] font-medium text-[#111214]">
                        {formatCoinTitle(w.symbol)}
                      </div>
                      <div className="text-[11.5px] text-[#8D929C]">
                        {w.sourceName}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                      w.marketVerdict === 'BULLISH_ABSORPTION'
                        ? 'bg-emerald-50 text-emerald-700'
                        : w.marketVerdict === 'BEARISH_DISTRIBUTION'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-[#F5F6F8] text-[#555962]'
                    }`}
                  >
                    {w.marketVerdict === 'BULLISH_ABSORPTION'
                      ? 'Custody accumulation'
                      : w.marketVerdict === 'BEARISH_DISTRIBUTION'
                      ? 'Exchange inflow risk'
                      : 'Wallet rebalance'}
                  </span>
                </div>

                <p className="text-[12px] text-[#4F535B] bg-[#F5F6F8] p-3.5 rounded-[18px] leading-relaxed">
                  &ldquo;{formatCleanText(w.rawExcerpt)}&rdquo;
                </p>

                <p className="text-[12.5px] text-[#111214] leading-relaxed">
                  <strong>Market verdict: </strong>
                  {formatCleanText(w.explanation)}
                </p>

                {w.url && (
                  <div className="flex items-center justify-between pt-1 text-[11.5px] text-[#8D929C]">
                    <span>
                      {w.onChainVerified
                        ? `Direct Ethereum block #${w.blockNumber?.toLocaleString()}`
                        : 'Verified creator feed'}
                    </span>
                    <a
                      href={w.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#111214] font-medium hover:underline inline-flex items-center gap-1"
                    >
                      {w.onChainVerified ? 'Etherscan tx' : 'Source'}{' '}
                      <SFArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
