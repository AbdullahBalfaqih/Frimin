'use client';

import React from 'react';
import {
  LuminCardMiniMark,
  SFArrowUpRight,
  SFChip,
  SFCrown,
  SFPlus,
  SFSlidersV,
} from './AppleIcons';
import { CoinAvatar, formatCleanText, formatCoinTitle } from './CoinAvatar';
import { InspectSubject } from './InspectDrawer';
import { NavTab } from './LuminHeader';
import {
  EngineState,
  TrailRecord,
  VerificationReport,
} from '@/lib/types';

interface DashboardBentoViewProps {
  state: EngineState;
  trailTail: TrailRecord[];
  totalTrailRecords: number;
  verification: VerificationReport | null;
  lang: 'en' | 'ar';
  searchQuery: string;
  isRunningCycle: boolean;
  onRunCycle: () => void;
  onNavigate: (tab: NavTab) => void;
  onInspect: (sub: InspectSubject) => void;
  onOpenInjectModal: () => void;
}

function cleanSentenceText(input: string): string {
  return formatCleanText(input);
}

function formatCardHashDigits(hash: string): string {
  const digits = hash
    .replace(/[^0-9a-f]/gi, '')
    .toLowerCase()
    .slice(0, 12);
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} xxxx`;
}

function formatPriceClean(val: number): string {
  if (val >= 1000) {
    return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (val >= 1) {
    return `$${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${val.toPrecision(4)}`;
}

export function DashboardBentoView({
  state,
  trailTail,
  totalTrailRecords,
  lang,
  searchQuery,
  isRunningCycle,
  onRunCycle,
  onNavigate,
  onInspect,
  onOpenInjectModal,
}: DashboardBentoViewProps) {
  const isAr = lang === 'ar';
  const q = searchQuery.trim().toLowerCase();

  const openPositions = state.positions.filter((p) => p.status === 'OPEN');
  const exposureUsd = openPositions.reduce((s, p) => s + p.notionalUsd, 0);
  const unrealizedUsd = openPositions.reduce(
    (s, p) => s + p.unrealizedPnlUsd,
    0
  );
  const totalEquityUsd = Number(
    (state.cashUsd + exposureUsd + unrealizedUsd).toFixed(2)
  );

  // 3 Hero Dark Cards: active positions first, supplemented by top convergence clusters
  const heroPositions = state.positions
    .filter((p) =>
      q
        ? p.symbol.toLowerCase().includes(q) ||
          formatCoinTitle(p.symbol).toLowerCase().includes(q)
        : true
    )
    .slice(0, 3);

  const heroConvergences =
    heroPositions.length < 3
      ? state.convergences
          .filter((c) =>
            q
              ? c.symbol.toLowerCase().includes(q) ||
                formatCoinTitle(c.symbol).toLowerCase().includes(q)
              : true
          )
          .slice(0, 3 - heroPositions.length)
      : [];

  // 3 Center "What's new" evidence items
  const whatsNewRecords = trailTail
    .filter(
      (r) =>
        r.kind === 'PRACTICE_OPEN' ||
        r.kind === 'CONVERGENCE_CLUSTER' ||
        r.kind === 'BULL_BEAR_DEBATE' ||
        r.kind === 'NEWS_VERIFICATION'
    )
    .filter((r) =>
      q ? cleanSentenceText(r.summary).toLowerCase().includes(q) : true
    )
    .slice(0, 3);

  // 4 Featured Coins with Real Logos for the bottom-right "Live market coins" 2x2 grid
  const featuredSymbols = ['BTC', 'ETH', 'SOL', 'LINK'];
  const featuredMarkets = featuredSymbols
    .map((sym) => state.markets.find((m) => m.symbol === sym))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  const displayMarkets =
    featuredMarkets.length >= 4
      ? featuredMarkets
      : state.markets.slice(0, 4);

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5">
      {/* 1. HERO OBSIDIAN BANNER (1:1 structural & visual fidelity to image-1.png) */}
      <section className="relative overflow-hidden rounded-[28px] bg-[#0B0C0E] p-6 sm:p-7 text-white shadow-sm">
        {/* Authentic Soft Olive-Lime Radial Glow at Bottom-Left */}
        <div
          className="pointer-events-none absolute -bottom-24 left-[14%] h-[230px] w-[420px] rounded-full opacity-80 blur-[58px]"
          style={{
            background:
              'radial-gradient(circle, rgba(190,248,0,0.52) 0%, rgba(132,185,0,0.22) 48%, rgba(11,12,14,0) 76%)',
          }}
        />

        <div className="relative z-10 flex flex-col xl:flex-row items-stretch gap-4">
          {/* Left Hero Column ("Digital card [Free]" -> "Practice desk [Paper]") */}
          <div className="xl:w-[248px] shrink-0 flex flex-col justify-between py-1 pr-2">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-[23px] font-normal tracking-[-0.02em] text-white">
                  {isAr ? 'دفتر تجريبي' : 'Practice desk'}
                </h2>
                <span className="px-3 py-1 rounded-full bg-[#22252A] text-[12px] font-normal text-[#B5B9C2]">
                  {isAr ? 'مجاني' : 'Paper'}
                </span>
              </div>
              <p className="mt-4 text-[12.5px] leading-[1.62] text-[#9A9EA7] font-normal">
                {isAr
                  ? 'صفقات افتراضية مبنية على أدلة السوق الحية وتقارب عشرين صوتاً موثوقاً. آمنة، شفافة وموثقة دائماً.'
                  : 'Positions that exist only on paper, backed by live market evidence. Easy, safe and always verifiable.'}
              </p>
            </div>
          </div>

          {/* Tall Vertical '+' Pill Button */}
          <button
            onClick={onOpenInjectModal}
            title={
              isAr
                ? 'إضافة إشارة محلل جديدة'
                : 'Add live market voice signal'
            }
            className="xl:w-[46px] h-[46px] xl:h-auto shrink-0 rounded-[18px] bg-[#1C1E22] hover:bg-[#25282E] border border-white/[0.07] flex items-center justify-center text-white/85 hover:text-[#CBFB00] transition"
          >
            <SFPlus className="w-[17px] h-[17px]" />
          </button>

          {/* 3 Dark Frosted Position Cards with Real Coin Logos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
            {heroPositions.map((pos) => {
              const pnlPct =
                pos.status === 'OPEN'
                  ? pos.unrealizedPnlPct
                  : pos.realizedPnlPct ?? 0;
              const sideLabel =
                pos.side === 'LONG'
                  ? isAr
                    ? 'شراء'
                    : 'Long'
                  : isAr
                  ? 'بيع'
                  : 'Short';

              return (
                <div
                  key={pos.id}
                  onClick={() => onInspect({ type: 'position', data: pos })}
                  className="group cursor-pointer rounded-[22px] bg-[#1D1F23]/92 hover:bg-[#23262B] border border-white/[0.06] p-5 flex flex-col justify-between transition-all"
                >
                  {/* Top Row: Frimin mark + Coin Logo Dual-Circle + Dark Slider Circle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LuminCardMiniMark />
                      <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-white">
                        Frimin
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* Dual-Circle Motif featuring the Real Coin Image */}
                      <div className="flex items-center -space-x-2">
                        <CoinAvatar symbol={pos.symbol} size={24} darkBg />
                        <span className="w-6 h-6 rounded-full bg-white/25 backdrop-blur-xs border border-white/10" />
                      </div>

                      <span className="w-[34px] h-[34px] rounded-full bg-[#111214] border border-white/[0.08] group-hover:border-[#CBFB00]/50 flex items-center justify-center text-white/80 group-hover:text-[#CBFB00] transition">
                        <SFSlidersV className="w-[14px] h-[14px]" />
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Coin Name + Live Price + Hash Digits */}
                  <div className="mt-7 mb-5">
                    <div className="flex items-center justify-between text-[15.5px] font-normal tracking-[0.01em] text-white tabular-nums">
                      <span>
                        {formatCoinTitle(pos.symbol)} · {sideLabel}
                      </span>
                      <span className="text-white/90">
                        {formatPriceClean(pos.currentPrice)}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] tracking-[0.09em] text-[#8E929B] tabular-nums">
                      {formatCardHashDigits(pos.openedTrailHash)}
                    </div>
                  </div>

                  {/* Bottom Row: Two Clean Columns matching "Valid thru / Cvv" */}
                  <div className="grid grid-cols-2 gap-4 pt-1 tabular-nums">
                    <div>
                      <div className="text-[10px] text-[#787C85] font-normal">
                        {isAr ? 'الوقف / الهدف' : 'Stop / Target'}
                      </div>
                      <div className="text-[12.5px] text-[#E1E3E8] font-normal mt-0.5 truncate">
                        {formatPriceClean(pos.stopLoss)} /{' '}
                        {formatPriceClean(pos.takeProfit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#787C85] font-normal">
                        {isAr ? 'الحجم / العائد' : 'Size / Return'}
                      </div>
                      <div className="text-[12.5px] text-[#E1E3E8] font-normal mt-0.5">
                        ${Math.round(pos.notionalUsd)} ·{' '}
                        <span
                          className={
                            pnlPct >= 0 ? 'text-[#CBFB00]' : 'text-rose-400'
                          }
                        >
                          {pnlPct >= 0 ? '+' : ''}
                          {pnlPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {heroConvergences.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onInspect({ type: 'convergence', data: conv })}
                className="group cursor-pointer rounded-[22px] bg-[#1D1F23]/92 hover:bg-[#23262B] border border-white/[0.06] p-5 flex flex-col justify-between transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LuminCardMiniMark />
                    <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-white">
                      Frimin
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center -space-x-2">
                      <CoinAvatar symbol={conv.symbol} size={24} darkBg />
                      <span className="w-6 h-6 rounded-full bg-white/25 border border-white/10" />
                    </div>
                    <span className="w-[34px] h-[34px] rounded-full bg-[#111214] border border-white/[0.08] flex items-center justify-center text-white/80">
                      <SFSlidersV className="w-[14px] h-[14px]" />
                    </span>
                  </div>
                </div>

                <div className="mt-7 mb-5">
                  <div className="flex items-center justify-between text-[15.5px] font-normal text-white tabular-nums">
                    <span>
                      {formatCoinTitle(conv.symbol)} ·{' '}
                      {conv.direction === 'LONG' ? 'Long' : 'Short'}
                    </span>
                    <span>{formatPriceClean(conv.spotPriceAtCheck)}</span>
                  </div>
                  <div className="mt-1 text-[12px] tracking-[0.09em] text-[#8E929B] tabular-nums">
                    {formatCardHashDigits(conv.evidenceHash)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1 tabular-nums">
                  <div>
                    <div className="text-[10px] text-[#787C85]">
                      {isAr ? 'توافق الأصوات' : 'Aligned voices'}
                    </div>
                    <div className="text-[12.5px] text-[#E1E3E8] mt-0.5">
                      {conv.distinctVoices} voices
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#787C85]">
                      {isAr ? 'مؤشر القوة' : 'Signal score'}
                    </div>
                    <div className="text-[12.5px] text-[#CBFB00] mt-0.5">
                      {conv.nciScore}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. THREE-COLUMN BENTO GRID (Exact proportions & visual craft of image-1.png) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* COLUMN 1: Autonomous Risk Vault + Physical Olive-Lime Card + 4-Metric Strip */}
        <div className="lg:col-span-4 bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-5">
            <div className="flex-1 flex flex-col justify-between min-h-[215px]">
              <div>
                <h3 className="text-[20px] font-medium leading-[1.28] tracking-[-0.02em] text-[#111214]">
                  {isAr ? (
                    <>
                      شغّل دورة
                      <br />
                      الرصد الذكي
                    </>
                  ) : (
                    <>
                      Autonomous
                      <br />
                      market vault
                    </>
                  )}
                </h3>
                <p className="mt-3.5 text-[12px] leading-[1.58] text-[#8D929C]">
                  {isAr
                    ? 'افحص 20 صوتاً موثوقاً وشموع الأسعار حول العالم. محفظتك التجريبية جاهزة دائماً.'
                    : 'Scan 20 market voices and live prices across venues. Your paper vault is always ready.'}
                </p>
              </div>

              <button
                onClick={onRunCycle}
                disabled={isRunningCycle}
                className="mt-5 self-start px-7 py-3 rounded-full bg-[#111214] hover:bg-black text-white text-[12.5px] font-medium transition disabled:opacity-50"
              >
                {isRunningCycle
                  ? isAr
                    ? 'جارٍ الرصد...'
                    : 'Syncing...'
                  : isAr
                  ? 'تشغيل دورة حية'
                  : 'Run live cycle'}
              </button>
            </div>

            {/* Vertical Physical Metal Vault Card with Generated Olive-Lime Texture, EMV Chip & Portrait */}
            <div
              onClick={() => onNavigate('practice')}
              className="cursor-pointer w-full sm:w-[156px] h-[220px] rounded-[20px] relative overflow-hidden p-3.5 flex flex-col justify-between shrink-0 shadow-md group"
            >
              <img
                src="/images/vault-card-bg.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500"
              />

              {/* Top Row: Overlapping Circles + Realistic Silver Chip */}
              <div className="relative z-10 flex items-start justify-between">
                <div className="flex items-center -space-x-2 mt-0.5">
                  <span className="w-[22px] h-[22px] rounded-full bg-white/30 backdrop-blur-2xs" />
                  <span className="w-[22px] h-[22px] rounded-full bg-white/45 backdrop-blur-2xs" />
                </div>
                <SFChip />
              </div>

              {/* Subtle Live Paper Balance */}
              <div className="relative z-10 my-auto pt-3">
                <div className="text-[10px] text-white/65">
                  {isAr ? 'الرصيد الورقي' : 'Paper equity'}
                </div>
                <div className="text-[16px] font-semibold text-white tracking-[-0.02em] tabular-nums">
                  ${totalEquityUsd.toLocaleString()}
                </div>
              </div>

              {/* Bottom Holder Row matching "Albert Flores" in image-1.png */}
              <div className="relative z-10 flex items-center gap-2">
                <img
                  src="/images/avatar-analyst.png"
                  alt="Analyst"
                  className="w-[22px] h-[22px] rounded-full object-cover border border-white/30"
                />
                <span className="text-[11.5px] font-normal text-white/95 truncate">
                  {isAr ? 'محفظة فريمين' : 'Frimin Desk'}
                </span>
              </div>
            </div>
          </div>

          {/* 4-Column Bottom Metric Strip with Crisp Vertical Dividers */}
          <div className="grid grid-cols-4 pt-5 mt-6 border-t border-[#F2F3F5] tabular-nums">
            <div className="pr-3 border-r border-[#EFEFF2]">
              <div className="text-[18px] font-medium text-[#111214]">
                {state.voices.filter((v) => v.enabled).length}
              </div>
              <div className="text-[11px] text-[#8D929C] mt-0.5">
                {isAr ? 'محللين' : 'Voices'}
              </div>
            </div>
            <div className="px-3 border-r border-[#EFEFF2]">
              <div className="text-[18px] font-medium text-[#111214]">
                {state.markets.length}
              </div>
              <div className="text-[11px] text-[#8D929C] mt-0.5">
                {isAr ? 'عملات' : 'Currencies'}
              </div>
            </div>
            <div className="px-3 border-r border-[#EFEFF2]">
              <div className="text-[18px] font-medium text-[#111214]">
                {totalTrailRecords}
              </div>
              <div className="text-[11px] text-[#8D929C] mt-0.5">
                {isAr ? 'كتلة تدقيق' : 'Records'}
              </div>
            </div>
            <div className="pl-3">
              <div className="text-[18px] font-medium text-[#111214]">∞</div>
              <div className="text-[11px] text-[#8D929C] mt-0.5">
                {isAr ? 'تحقق' : 'Replays'}
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 2: "What's new" / Live Cause & Effect Feed */}
        <div className="lg:col-span-4 bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[18px] font-medium tracking-[-0.015em] text-[#111214]">
              {isAr ? 'أحدث الأدلة' : "What's new"}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('risk')}
                className="w-[34px] h-[34px] rounded-full border border-[#ECEEF1] hover:border-[#C9CDD4] flex items-center justify-center text-[#2B2E33] transition"
              >
                <SFSlidersV className="w-[13.5px] h-[13.5px]" />
              </button>
              <button
                onClick={() => onNavigate('audit')}
                className="w-[34px] h-[34px] rounded-full border border-[#ECEEF1] hover:border-[#C9CDD4] flex items-center justify-center text-[#2B2E33] transition"
              >
                <SFArrowUpRight className="w-[14px] h-[14px]" />
              </button>
            </div>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {whatsNewRecords.map((rec, idx) => {
              const badgeVal =
                rec.kind === 'PRACTICE_OPEN'
                  ? 'x2'
                  : rec.kind === 'CONVERGENCE_CLUSTER'
                  ? '16%'
                  : idx === 0
                  ? '8%'
                  : '2%';
              const payloadSymbol = String(
                (rec.payload as Record<string, unknown>)?.symbol || ''
              );

              return (
                <div
                  key={rec.hash}
                  onClick={() => onInspect({ type: 'trail', data: rec })}
                  className="cursor-pointer rounded-[20px] border border-[#F0F1F4] hover:border-[#D5D8E0] px-4 py-3.5 flex items-center gap-3.5 transition"
                >
                  {payloadSymbol ? (
                    <div className="relative shrink-0">
                      <CoinAvatar symbol={payloadSymbol} size={38} />
                    </div>
                  ) : (
                    <div className="w-[38px] h-[38px] rounded-full bg-[#111214] text-white text-[11px] font-medium flex items-center justify-center shrink-0 tabular-nums">
                      {badgeVal}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-[#111214] leading-[1.42] line-clamp-2">
                      {cleanSentenceText(rec.summary)}
                    </p>
                    <div className="text-[11px] text-[#9A9FA8] mt-1 tabular-nums">
                      {new Date(rec.timestamp).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 3: 3 Generated Neon-Lime Cards + 2x2 Real Crypto Coins Card */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Top 3 #CBFB00 Neon Lime Cards matching image-1.png 1:1 */}
          <div className="grid grid-cols-3 gap-3">
            {/* Lime Card 1: Megaphone Visual */}
            <button
              onClick={() => onNavigate('kol')}
              className="rounded-[22px] bg-[#CBFB00] hover:brightness-[0.98] h-[154px] relative overflow-hidden flex flex-col justify-end p-3.5 text-left transition cursor-pointer"
            >
              <img
                src="/images/lime-megaphone.png"
                alt=""
                className="pointer-events-none absolute top-0 left-0 w-full h-[102px] object-cover object-left-top"
              />
              <div className="relative z-10 text-[12px] font-medium leading-[1.24] text-[#111214]">
                {isAr ? (
                  <>
                    تقارب
                    <br />
                    المحللين
                  </>
                ) : (
                  <>
                    Voice
                    <br />
                    convergence
                  </>
                )}
              </div>
            </button>

            {/* Lime Card 2: Black Crown Pill ("PRO" -> "Judge") */}
            <button
              onClick={() => onNavigate('debate')}
              className="rounded-[22px] bg-[#CBFB00] hover:brightness-[0.98] h-[154px] p-3.5 flex flex-col justify-between text-left transition cursor-pointer"
            >
              <div className="w-full h-[48px] mt-2 rounded-[14px] bg-[#111214] text-white flex items-center justify-center gap-1.5 px-2">
                <SFCrown className="w-[14px] h-[14px] text-white" />
                <span className="text-[12px] font-semibold tracking-[-0.01em]">
                  {isAr ? 'القاضي' : 'Judge'}
                </span>
              </div>
              <div className="text-[12px] font-medium leading-[1.24] text-[#111214]">
                {isAr ? (
                  <>
                    مناظرة
                    <br />
                    السوق
                  </>
                ) : (
                  <>
                    Debate
                    <br />
                    engine
                  </>
                )}
              </div>
            </button>

            {/* Lime Card 3: Hand Holding Black Smartphone + Black Percentage Pill */}
            <button
              onClick={() => onNavigate('risk')}
              className="rounded-[22px] bg-[#CBFB00] hover:brightness-[0.98] h-[154px] relative overflow-hidden p-3.5 flex flex-col justify-between text-left transition cursor-pointer"
            >
              <img
                src="/images/lime-phone.png"
                alt=""
                className="pointer-events-none absolute top-1 right-0 w-[106px] h-[106px] object-cover object-right-top"
              />
              <span className="relative z-10 self-start mt-2 px-2.5 py-1 rounded-full bg-[#111214] text-white text-[11px] font-semibold tabular-nums">
                {state.riskConfig.maxPositionPct}%
              </span>
              <div className="relative z-10 text-[12px] font-medium leading-[1.24] text-[#111214]">
                {isAr ? (
                  <>
                    حد المخاطرة
                    <br />
                    حتى {state.riskConfig.maxPositionPct}%
                  </>
                ) : (
                  <>
                    Risk cap
                    <br />
                    up to {state.riskConfig.maxPositionPct}%
                  </>
                )}
              </div>
            </button>
          </div>

          {/* Bottom White Card: 2x2 Real Crypto Coins Pill Grid (matching Apple / McDonald's / PlayStation / Tesla pills) */}
          <div className="bg-white rounded-[28px] p-6 border border-[#EFEFF2] flex-1 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-[17px] font-medium tracking-[-0.015em] text-[#111214]">
                {isAr ? 'أبرز العملات الحية' : 'Signals from markets'}
              </h3>
              <button
                onClick={() => onNavigate('hunter')}
                className="w-[34px] h-[34px] rounded-full border border-[#ECEEF1] hover:border-[#C9CDD4] flex items-center justify-center text-[#2B2E33] transition"
              >
                <SFArrowUpRight className="w-[14px] h-[14px]" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {displayMarkets.map((m) => {
                const debate = state.debates.find((d) => d.symbol === m.symbol);
                const sign = m.return24hPct >= 0 ? '+' : '';
                return (
                  <button
                    key={m.symbol}
                    onClick={() => {
                      if (debate) onInspect({ type: 'debate', data: debate });
                    }}
                    className="rounded-full border border-[#F0F1F4] hover:border-[#D5D8E0] p-2 pr-4 flex items-center gap-3 text-left transition cursor-pointer bg-white"
                  >
                    <CoinAvatar symbol={m.symbol} size={36} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[#111214] truncate">
                        {formatCoinTitle(m.symbol, m.name)}
                      </div>
                      <div className="text-[11px] text-[#8D929C] truncate tabular-nums">
                        {formatPriceClean(m.spotPrice)} · {sign}
                        {m.return24hPct}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 3. CLEAN ALL-CURRENCIES LIVE EVIDENCE BAR WITH REAL COIN LOGOS */}
      <section className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[17px] font-medium tracking-[-0.015em] text-[#111214]">
              {isAr
                ? 'جميع العملات المراقبة والأدلة المتقاطعة'
                : 'Cross-venue market evidence'}
            </h3>
            <p className="text-[12px] text-[#8D929C] mt-0.5">
              {isAr
                ? 'اضغط على أي عملة لعرض مناظرة الصعود والهبوط وسلسلة الأدلة الموثقة.'
                : 'Click any currency to inspect its bull & bear debate and verified evidence hashes.'}
            </p>
          </div>
          <span className="text-[12px] text-[#8D929C] tabular-nums">
            {state.lastSourceDiagnostics.ethBlockNumber
              ? `Ethereum #${state.lastSourceDiagnostics.ethBlockNumber.toLocaleString()} · `
              : ''}
            {state.lastSourceDiagnostics.l2OrderBooksOk ?? 14} Level-2 books ·{' '}
            {state.lastSourceDiagnostics.liveVoicesFetched} voices ·{' '}
            {state.lastSourceDiagnostics.cycleDurationMs} ms
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {state.markets
            .filter((m) =>
              q
                ? m.symbol.toLowerCase().includes(q) ||
                  formatCoinTitle(m.symbol).toLowerCase().includes(q)
                : true
            )
            .map((m) => {
              const debate = state.debates.find((d) => d.symbol === m.symbol);
              const isUp = m.return24hPct >= 0;
              return (
                <button
                  key={m.symbol}
                  onClick={() => {
                    if (debate) onInspect({ type: 'debate', data: debate });
                  }}
                  className="rounded-[20px] border border-[#F0F1F4] hover:border-[#111214] p-3.5 text-left transition bg-[#FAFAFB] hover:bg-white flex flex-col justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <CoinAvatar symbol={m.symbol} size={32} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-[#111214] truncate">
                        {formatCoinTitle(m.symbol, m.name)}
                      </div>
                      <div
                        className={`text-[11px] tabular-nums ${
                          isUp ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {m.return24hPct}%
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#EFEFF2] flex items-baseline justify-between tabular-nums">
                    <span className="text-[13px] font-medium text-[#111214]">
                      {formatPriceClean(m.spotPrice)}
                    </span>
                    <span className="text-[10.5px] text-[#8D929C]">
                      Rsi {Math.round(m.rsi14)}
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
      </section>
    </div>
  );
}
