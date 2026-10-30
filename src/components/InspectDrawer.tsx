'use client';

import React from 'react';
import {
  SFArrowUpRight,
  SFCheckCircle,
  SFClose,
  SFShield,
} from './AppleIcons';
import { CoinAvatar, formatCleanText, formatCoinTitle } from './CoinAvatar';
import {
  BullBearDebate,
  ConvergenceCluster,
  PracticePosition,
  TrailRecord,
} from '@/lib/types';

export type InspectSubject =
  | { type: 'position'; data: PracticePosition }
  | { type: 'convergence'; data: ConvergenceCluster }
  | { type: 'debate'; data: BullBearDebate }
  | { type: 'trail'; data: TrailRecord }
  | null;

interface InspectDrawerProps {
  subject: InspectSubject;
  onClose: () => void;
  onClosePosition?: (id: string) => void;
  lang: 'en' | 'ar';
}

function humanizeStrategy(s: string): string {
  if (s === 'KOL_CONVERGENCE') return 'Voice convergence';
  if (s === 'ATOMIC_BUY_THE_DIP') return 'Dip entry';
  if (s === 'DEBATE_CONSENSUS') return 'Judge consensus';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function humanizeVerdict(v: string): string {
  if (v === 'RISK_ON_LONG') return 'Bullish edge · Long';
  if (v === 'RISK_OFF_SHORT') return 'Bearish edge · Short';
  return 'Balanced · Stand aside';
}

export function InspectDrawer({
  subject,
  onClose,
  onClosePosition,
  lang,
}: InspectDrawerProps) {
  if (!subject) return null;
  const isAr = lang === 'ar';

  const symbolForAvatar =
    subject.type === 'position'
      ? subject.data.symbol
      : subject.type === 'convergence'
      ? subject.data.symbol
      : subject.type === 'debate'
      ? subject.data.symbol
      : String((subject.data.payload as Record<string, unknown>)?.symbol || '');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-xs">
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-[#EFEFF2] flex flex-col justify-between overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#0B0C0E] text-white flex items-center justify-between relative overflow-hidden">
          <div className="pointer-events-none absolute -bottom-10 left-8 w-52 h-24 rounded-full bg-[#CBFB00]/30 blur-2xl" />
          <div className="relative z-10 flex items-center gap-3.5">
            {symbolForAvatar ? (
              <CoinAvatar symbol={symbolForAvatar} size={40} darkBg />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[#CBFB00]">
                <SFShield className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="text-[11.5px] text-[#CBFB00] font-medium">
                {isAr
                  ? 'أثر السبب والنتيجة الموثق'
                  : 'Verified cause & effect trail'}
              </div>
              <h3 className="text-[17px] font-medium mt-0.5">
                {subject.type === 'position' &&
                  `${formatCoinTitle(subject.data.symbol)} · ${
                    subject.data.side === 'LONG' ? 'Long' : 'Short'
                  } (${humanizeStrategy(subject.data.strategy)})`}
                {subject.type === 'convergence' &&
                  `${formatCoinTitle(subject.data.symbol)} · Voice convergence`}
                {subject.type === 'debate' &&
                  `${formatCoinTitle(subject.data.symbol)} · Market debate`}
                {subject.type === 'trail' &&
                  `Record #${subject.data.index}`}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="relative z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
          >
            <SFClose />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-[13px]">
          {subject.type === 'position' && (
            <>
              <div className="grid grid-cols-3 gap-3 tabular-nums">
                <div className="p-3.5 rounded-[18px] bg-[#F5F6F8]">
                  <div className="text-[11px] text-[#8D929C]">
                    Entry → Current
                  </div>
                  <div className="font-medium text-[#111214] mt-1">
                    ${subject.data.entryPrice.toLocaleString()} → $
                    {subject.data.currentPrice.toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 rounded-[18px] bg-[#F5F6F8]">
                  <div className="text-[11px] text-[#8D929C]">
                    Size & risk
                  </div>
                  <div className="font-medium text-[#111214] mt-1">
                    ${subject.data.notionalUsd} (${subject.data.riskAmountUsd})
                  </div>
                </div>
                <div className="p-3.5 rounded-[18px] bg-[#F5F6F8]">
                  <div className="text-[11px] text-[#8D929C]">
                    Stop / Target
                  </div>
                  <div className="font-medium text-[#111214] mt-1">
                    ${subject.data.stopLoss} / ${subject.data.takeProfit}
                  </div>
                </div>
              </div>

              {subject.data.slippageBps !== undefined && (
                <div className="p-3.5 rounded-[18px] bg-[#F5F6F8] flex flex-wrap items-center justify-between gap-2 text-[11.5px] tabular-nums">
                  <span className="text-[#555962]">
                    Level-2 book fill · Spread {subject.data.spreadBps} bps
                  </span>
                  <span className="font-medium text-[#111214]">
                    Slippage {subject.data.slippageBps} bps · Fee $
                    {subject.data.takerFeeUsd}
                  </span>
                </div>
              )}

              <div>
                <h4 className="text-[12px] font-medium text-[#8D929C] mb-2.5">
                  {isAr ? 'تسلسل السبب والنتيجة' : 'Cause and effect reasoning'}
                </h4>
                <div className="space-y-2.5">
                  {subject.data.causeAndEffectChain.map((step, i) => (
                    <div
                      key={i}
                      className="p-3.5 rounded-[18px] border border-[#EFEFF2] bg-white flex items-start gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#111214] text-[#CBFB00] text-[11px] font-medium flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                        {i + 1}
                      </span>
                      <p className="text-[12.5px] leading-relaxed text-[#22252B]">
                        {formatCleanText(step)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-[12px] font-medium text-[#8D929C] mb-2">
                  Cryptographic audit hashes
                </h4>
                <div className="p-4 rounded-[18px] bg-[#0B0C0E] text-white/85 font-mono text-[11px] space-y-1.5 break-all">
                  <div>
                    <span className="text-[#CBFB00]">Opened block: </span>
                    {subject.data.openedTrailHash}
                  </div>
                  {subject.data.closedTrailHash && (
                    <div>
                      <span className="text-[#CBFB00]">Settled block: </span>
                      {subject.data.closedTrailHash}
                    </div>
                  )}
                  <div className="pt-1 text-white/55">
                    Evidence inputs ({subject.data.evidenceHashes.length}):
                  </div>
                  {subject.data.evidenceHashes.map((eh, idx) => (
                    <div key={idx} className="text-white/75">
                      • {eh}
                    </div>
                  ))}
                </div>
              </div>

              {subject.data.status === 'OPEN' && onClosePosition && (
                <button
                  onClick={() => {
                    onClosePosition(subject.data.id);
                    onClose();
                  }}
                  className="w-full py-3 rounded-full bg-[#111214] hover:bg-black text-white text-[12.5px] font-medium transition"
                >
                  {isAr
                    ? 'إغلاق الصفقة التجريبية بالسعر الحي الآن'
                    : 'Settle practice position at live price'}
                </button>
              )}
            </>
          )}

          {subject.type === 'convergence' && (
            <>
              <div className="p-4 rounded-[20px] bg-[#F5F6F8] flex items-center justify-between tabular-nums">
                <div>
                  <div className="text-[11.5px] text-[#8D929C]">
                    Convergence score
                  </div>
                  <div className="text-[22px] font-semibold text-[#111214]">
                    {subject.data.nciScore} / 100
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11.5px] text-[#8D929C]">
                    Aligned voices
                  </div>
                  <div className="text-[16px] font-medium text-[#111214]">
                    {subject.data.distinctVoices} voices ·{' '}
                    {subject.data.direction === 'LONG' ? 'Long' : 'Short'}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-[18px] border border-[#EFEFF2] text-[12.5px] text-[#22252B]">
                <strong>Market verification:</strong>{' '}
                {formatCleanText(subject.data.marketCheckNote)}
              </div>

              <div>
                <h4 className="text-[12px] font-medium text-[#8D929C] mb-2.5">
                  Contributing voices ({subject.data.contributingSignals.length})
                </h4>
                <div className="space-y-2.5">
                  {subject.data.contributingSignals.map((sig) => (
                    <div
                      key={sig.postHash}
                      className="p-3.5 rounded-[18px] border border-[#EFEFF2] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[12.5px] text-[#111214]">
                          {formatCleanText(sig.voiceName)} (
                          {sig.platform === 'ResearchRSS' ? 'Feed' : sig.platform}
                          )
                        </span>
                        <a
                          href={sig.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11.5px] text-[#555962] hover:text-[#111214]"
                        >
                          Source <SFArrowUpRight className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-[12px] text-[#4F535B] leading-relaxed">
                        &ldquo;{formatCleanText(sig.excerpt)}&rdquo;
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-[#8D929C] tabular-nums">
                        <span>Sentiment {sig.sentiment}</span>
                        <span>· Conviction {Math.round(sig.conviction * 100)}%</span>
                        <span>· Urgency {Math.round(sig.urgency * 100)}%</span>
                        <span>· Trust {sig.trustWeight}x</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {subject.type === 'debate' && (
            <>
              <div className="p-4 rounded-[20px] bg-[#0B0C0E] text-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#CBFB00] font-medium">
                    Judge ruling
                  </span>
                  <span className="px-3 py-0.5 rounded-full text-[11.5px] font-medium bg-[#CBFB00] text-[#111214]">
                    {humanizeVerdict(subject.data.judgeVerdict)}
                  </span>
                </div>
                <p className="text-[12.5px] text-white/85 leading-relaxed">
                  {formatCleanText(subject.data.judgeRationale)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-[20px] border border-emerald-200/80 bg-emerald-50/35 space-y-2">
                  <div className="font-medium text-[12.5px] text-emerald-900 tabular-nums">
                    Bull case ({subject.data.bullTotalScore})
                  </div>
                  {subject.data.bullArguments.map((arg, i) => (
                    <div
                      key={i}
                      className="text-[12px] space-y-0.5 border-t border-emerald-100 pt-1.5"
                    >
                      <div className="font-medium text-emerald-800 tabular-nums">
                        +{arg.weight} · {formatCleanText(arg.metricValue)}
                      </div>
                      <p className="text-[#4F535B]">
                        {formatCleanText(arg.claim)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-[20px] border border-rose-200/80 bg-rose-50/35 space-y-2">
                  <div className="font-medium text-[12.5px] text-rose-900 tabular-nums">
                    Bear case ({subject.data.bearTotalScore})
                  </div>
                  {subject.data.bearArguments.map((arg, i) => (
                    <div
                      key={i}
                      className="text-[12px] space-y-0.5 border-t border-rose-100 pt-1.5"
                    >
                      <div className="font-medium text-rose-800 tabular-nums">
                        -{arg.weight} · {formatCleanText(arg.metricValue)}
                      </div>
                      <p className="text-[#4F535B]">
                        {formatCleanText(arg.claim)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-[18px] bg-[#F5F6F8] font-mono text-[11px] space-y-1 break-all">
                <div className="font-sans font-medium text-[12px] text-[#111214] mb-1">
                  Shared evidence hashes ({subject.data.sharedEvidenceHashes.length}):
                </div>
                {subject.data.sharedEvidenceHashes.map((h) => (
                  <div key={h} className="text-[#555962]">
                    • {h}
                  </div>
                ))}
              </div>
            </>
          )}

          {subject.type === 'trail' && (
            <>
              <div className="p-4 rounded-[18px] bg-[#F5F6F8] space-y-1.5 text-[12.5px]">
                <div className="font-medium text-[#111214]">
                  {formatCleanText(subject.data.summary)}
                </div>
                <div className="text-[#8D929C] text-[11.5px]">
                  {new Date(subject.data.timestamp).toLocaleString()} ·{' '}
                  {subject.data.ruleVersion}
                </div>
              </div>

              <div className="p-4 rounded-[18px] bg-[#0B0C0E] text-white font-mono text-[11px] space-y-1.5 break-all">
                <div>
                  <span className="text-[#CBFB00]">Block hash: </span>
                  {subject.data.hash}
                </div>
                <div>
                  <span className="text-white/55">Prev hash:  </span>
                  {subject.data.prevHash}
                </div>
                {subject.data.causedByHash && (
                  <div>
                    <span className="text-emerald-400">Caused by:  </span>
                    {subject.data.causedByHash}
                  </div>
                )}
                {subject.data.signature && (
                  <div>
                    <span className="text-[#CBFB00]">Ed25519 sig: </span>
                    {subject.data.signature}
                  </div>
                )}
                {subject.data.signerPublicKey && (
                  <div>
                    <span className="text-white/55">Notary key:  </span>
                    {subject.data.signerPublicKey}
                  </div>
                )}
              </div>

              <pre className="p-4 rounded-[18px] bg-[#F5F6F8] text-[11px] font-mono text-[#22252B] overflow-x-auto leading-relaxed">
                {formatCleanText(JSON.stringify(subject.data.payload, null, 2))}
              </pre>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#EFEFF2] bg-[#FAFAFB] flex items-center justify-between text-[12px] text-[#8D929C]">
          <span className="inline-flex items-center gap-1.5">
            <SFCheckCircle className="w-4 h-4 text-emerald-600" />
            Paper ledger only · Zero private keys
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#111214] text-white font-medium text-[12px]"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
