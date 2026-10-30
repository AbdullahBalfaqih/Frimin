'use client';

import React, { useState } from 'react';
import {
  LuminLogoMark,
  SFArrowLeft,
  SFBell,
  SFCalendar,
  SFChevronDown,
  SFClose,
  SFGear,
  SFMagnifier,
  SFRefresh,
  SFSlidersV,
} from './AppleIcons';
import { VerificationReport } from '@/lib/types';

export type NavTab =
  | 'dashboard'
  | 'kol'
  | 'debate'
  | 'practice'
  | 'audit'
  | 'hunter'
  | 'risk';

interface LuminHeaderProps {
  activeTab: NavTab;
  setActiveTab: (t: NavTab) => void;
  lang: 'en' | 'ar';
  setLang: (l: 'en' | 'ar') => void;
  autoSync: boolean;
  setAutoSync: (v: boolean) => void;
  isRunningCycle: boolean;
  onRunCycle: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  cycleCount: number;
  lastCycleAt: string | null;
  verification: VerificationReport | null;
}

const NAV_ITEMS: {
  id: NavTab;
  en: string;
  ar: string;
  headingEn: string;
  headingAr: string;
}[] = [
  {
    id: 'dashboard',
    en: 'Dashboard',
    ar: 'الرئيسية',
    headingEn: 'Positions',
    headingAr: 'الصفقات والأدلة',
  },
  {
    id: 'kol',
    en: 'Voices',
    ar: 'المحللون',
    headingEn: 'Market voices',
    headingAr: 'أصوات السوق العشرون',
  },
  {
    id: 'debate',
    en: 'Analytics',
    ar: 'المناظرة',
    headingEn: 'Market debate',
    headingAr: 'مناظرة الصعود والهبوط',
  },
  {
    id: 'practice',
    en: 'Positions',
    ar: 'المحفظة',
    headingEn: 'Practice ledger',
    headingAr: 'دفتر الصفقات التجريبية',
  },
  {
    id: 'audit',
    en: 'History',
    ar: 'السجل',
    headingEn: 'Audit history',
    headingAr: 'سجل الاستدلال المتسلسل',
  },
  {
    id: 'hunter',
    en: 'Services',
    ar: 'الماسح',
    headingEn: 'Token & news scanner',
    headingAr: 'ماسح العملات والأخبار',
  },
  {
    id: 'risk',
    en: 'Rules',
    ar: 'القواعد',
    headingEn: 'Risk settings',
    headingAr: 'ضوابط المخاطر',
  },
];

export function LuminHeader({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  autoSync,
  setAutoSync,
  isRunningCycle,
  onRunCycle,
  searchQuery,
  setSearchQuery,
  cycleCount,
  verification,
}: LuminHeaderProps) {
  const isAr = lang === 'ar';
  const [searchOpen, setSearchOpen] = useState(false);

  const currentMeta =
    NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="w-full">
      {/* Pure White Edge-to-Edge Top Navigation Bar matching image-1.png */}
      <header className="w-full bg-white border-b border-[#EFEFEF]">
        <div className="max-w-[1380px] mx-auto px-5 sm:px-9 h-[74px] flex items-center justify-between gap-4">
          {/* Left: Frimin Emblem + Wordmark */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 focus:outline-none group"
          >
            <LuminLogoMark className="w-[32px] h-[32px] group-hover:scale-105 transition" />
            <span className="text-[22px] font-semibold tracking-[-0.035em] text-[#111214]">
              Frimin
            </span>
          </button>

          {/* Center: Clean Unboxed Text Tabs with Single Solid Black Active Pill */}
          <nav className="hidden lg:flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-5 py-2 rounded-full text-[13.5px] transition-all ${
                    isActive
                      ? 'bg-[#111214] text-white font-medium shadow-xs'
                      : 'text-[#4F535B] hover:text-[#111214] font-normal'
                  }`}
                >
                  {isAr ? item.ar : item.en}
                </button>
              );
            })}
          </nav>

          {/* Right: Apple-Style Circular Controls + Real Portrait Avatar */}
          <div className="flex items-center gap-2.5">
            {/* Subtle Language Switch Circle */}
            <button
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              title={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
              className="h-[38px] px-3 rounded-full bg-[#F8F9FA] hover:bg-[#EFEFF2] border border-[#ECEEF1] text-[12px] font-medium text-[#111214] transition"
            >
              {isAr ? 'En' : 'عربي'}
            </button>

            {/* Bell / Live Auto-Sync Toggle */}
            <button
              onClick={() => setAutoSync(!autoSync)}
              title={
                autoSync
                  ? `Live auto-sync active · ${verification?.checkedRecords ?? 0} verified blocks`
                  : 'Click to resume live auto-sync'
              }
              className="relative w-[38px] h-[38px] rounded-full bg-[#F8F9FA] hover:bg-[#EFEFF2] border border-[#ECEEF1] flex items-center justify-center text-[#2B2E33] transition"
            >
              <SFBell />
              <span
                className={`absolute top-[9px] right-[10px] w-[6px] h-[6px] rounded-full ${
                  autoSync ? 'bg-[#FF453A]' : 'bg-[#A0A5B1]'
                }`}
              />
            </button>

            {/* Settings Gear */}
            <button
              onClick={() => setActiveTab('risk')}
              title="Risk & engine settings"
              className="w-[38px] h-[38px] rounded-full bg-[#F8F9FA] hover:bg-[#EFEFF2] border border-[#ECEEF1] flex items-center justify-center text-[#2B2E33] transition"
            >
              <SFGear />
            </button>

            {/* Real Human Portrait Avatar matching image-1.png */}
            <button
              onClick={() => setActiveTab('audit')}
              title={`Verified chain · ${verification?.checkedRecords ?? 0} blocks`}
              className="w-[38px] h-[38px] rounded-full overflow-hidden border border-[#E5E7EB] shrink-0 focus:outline-none"
            >
              <img
                src="/images/avatar-analyst.png"
                alt="Analyst profile"
                className="w-full h-full object-cover"
              />
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Compact Nav Strip */}
        <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto px-5 pb-3">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-4 py-1.5 rounded-full text-[12.5px] whitespace-nowrap transition ${
                  isActive
                    ? 'bg-[#111214] text-white font-medium'
                    : 'bg-[#F5F6F8] text-[#4F535B]'
                }`}
              >
                {isAr ? item.ar : item.en}
              </button>
            );
          })}
        </div>
      </header>

      {/* Sub-Header Bar on #F5F6F8 Canvas matching "<- Cards ... [Q] [||] [27 Jan - 27 Feb, 2025 v]" */}
      <div className="max-w-[1380px] mx-auto px-5 sm:px-9 pt-7 pb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() =>
              activeTab === 'dashboard'
                ? onRunCycle()
                : setActiveTab('dashboard')
            }
            disabled={isRunningCycle}
            title={
              activeTab === 'dashboard'
                ? 'Run fresh market & voice cycle'
                : 'Back to dashboard'
            }
            className="w-[40px] h-[40px] rounded-full bg-white border border-[#E7E9ED] hover:border-[#C9CDD4] flex items-center justify-center text-[#111214] transition shadow-2xs disabled:opacity-50"
          >
            {isRunningCycle ? (
              <SFRefresh className="w-[15px] h-[15px] animate-spin" />
            ) : (
              <SFArrowLeft
                className={`w-[16px] h-[16px] ${isAr ? 'rotate-180' : ''}`}
              />
            )}
          </button>

          <h1 className="text-[32px] sm:text-[36px] font-normal tracking-[-0.025em] text-[#111214] leading-none">
            {isAr ? currentMeta.headingAr : currentMeta.headingEn}
          </h1>
        </div>

        {/* Right Controls: Circular Search + Circular Sliders + Date/Cycle Pill */}
        <div className="flex items-center gap-2.5">
          {searchOpen || searchQuery ? (
            <div className="relative flex items-center">
              <SFMagnifier className="w-[15px] h-[15px] text-[#7D828C] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAr ? 'ابحث عن عملة أو محلل...' : 'Search coin or voice...'
                }
                className="h-[40px] pl-9 pr-8 w-48 sm:w-56 rounded-full bg-white border border-[#E7E9ED] text-[12.5px] text-[#111214] placeholder-[#8E939D] focus:outline-none focus:border-[#111214] transition"
              />
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                className="absolute right-2.5 text-[#8E939D] hover:text-[#111214]"
              >
                <SFClose className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              title="Search tokens & voices"
              className="w-[40px] h-[40px] rounded-full bg-white border border-[#E7E9ED] hover:border-[#C9CDD4] flex items-center justify-center text-[#2B2E33] transition"
            >
              <SFMagnifier />
            </button>
          )}

          <button
            onClick={() => setActiveTab('risk')}
            title="Filter & risk rules"
            className="w-[40px] h-[40px] rounded-full bg-white border border-[#E7E9ED] hover:border-[#C9CDD4] flex items-center justify-center text-[#2B2E33] transition"
          >
            <SFSlidersV />
          </button>

          {/* Date Window & Live Cycle Trigger Pill matching "27 Jan - 27 Feb, 2025 v" */}
          <button
            onClick={onRunCycle}
            disabled={isRunningCycle}
            className="h-[40px] px-4 rounded-full bg-white hover:bg-[#FAFAFB] border border-[#E7E9ED] hover:border-[#C9CDD4] flex items-center gap-2.5 text-[12.5px] font-normal text-[#111214] transition tabular-nums disabled:opacity-60"
          >
            <SFCalendar className="w-[15px] h-[15px] text-[#555962]" />
            <span>
              {isRunningCycle
                ? isAr
                  ? 'جارٍ تحديث بيانات السوق...'
                  : 'Syncing live market...'
                : isAr
                ? `16 أكتوبر - 30 أكتوبر 2026 · دورة #${cycleCount}`
                : `16 Oct - 30 Oct, 2026 · #${cycleCount}`}
            </span>
            <SFChevronDown className="w-[13px] h-[13px] text-[#7D828C]" />
          </button>
        </div>
      </div>
    </div>
  );
}
