'use client';

import React, { useState } from 'react';
import {
  SFArrowUpRight,
  SFCheckCircle,
  SFClose,
  SFPlus,
} from './AppleIcons';
import { CoinAvatar, formatCleanText, formatCoinTitle } from './CoinAvatar';
import { InspectSubject } from './InspectDrawer';
import {
  EngineState,
  KOLVoice,
  PlatformSource,
  VoiceCategory,
} from '@/lib/types';

interface KolRadarViewProps {
  state: EngineState;
  lang: 'en' | 'ar';
  searchQuery: string;
  onInspect: (s: InspectSubject) => void;
  onSaveVoices: (voices: KOLVoice[]) => Promise<void>;
  onInjectPost: (post: {
    voiceName: string;
    handle: string;
    platform: PlatformSource;
    text: string;
    url?: string;
    trustWeight?: number;
  }) => Promise<void>;
}

export function KolRadarView({
  state,
  lang,
  searchQuery,
  onInspect,
  onSaveVoices,
  onInjectPost,
}: KolRadarViewProps) {
  const isAr = lang === 'ar';
  const q = searchQuery.trim().toLowerCase();

  const [newName, setNewName] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [newPlatform, setNewPlatform] = useState<PlatformSource>('Telegram');
  const [newCategory, setNewCategory] =
    useState<VoiceCategory>('Alpha & Narrative');

  const [postHandle, setPostHandle] = useState('@cobie');
  const [postVoiceName, setPostVoiceName] = useState('Cobie');
  const [postPlatform, setPostPlatform] = useState<PlatformSource>('X');
  const [postText, setPostText] = useState('');
  const [postUrl, setPostUrl] = useState('');
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

  const handleAddVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newHandle.trim()) return;
    if (state.voices.length >= 20) return;

    const cleanHandle = newHandle.trim().replace(/^@/, '');
    const feedUrl =
      newPlatform === 'Telegram'
        ? `https://t.me/s/${cleanHandle}`
        : newPlatform === 'X'
        ? `https://x.com/${cleanHandle}`
        : newHandle.trim();

    const added: KOLVoice = {
      id: `voice-${Date.now().toString(36)}`,
      name: newName.trim(),
      handle: cleanHandle,
      platform: newPlatform,
      feedUrl,
      category: newCategory,
      baseTrust: 1.25,
      dynamicTrust: 1.25,
      gradedCalls: 0,
      accurateCalls: 0,
      enabled: true,
    };
    await onSaveVoices([added, ...state.voices].slice(0, 20));
    setNewName('');
    setNewHandle('');
  };

  const handleToggleVoice = async (id: string) => {
    await onSaveVoices(
      state.voices.map((v) =>
        v.id === id ? { ...v, enabled: !v.enabled } : v
      )
    );
  };

  const handleDeleteVoice = async (id: string) => {
    await onSaveVoices(state.voices.filter((v) => v.id !== id));
  };

  const handleInjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText.trim()) return;
    setIsSubmittingPost(true);
    try {
      await onInjectPost({
        voiceName: postVoiceName,
        handle: postHandle,
        platform: postPlatform,
        text: postText,
        url: postUrl || undefined,
        trustWeight: 1.35,
      });
      setPostText('');
      setPostUrl('');
    } finally {
      setIsSubmittingPost(false);
    }
  };

  const filteredConvergences = state.convergences.filter((c) =>
    q
      ? c.symbol.toLowerCase().includes(q) ||
        formatCoinTitle(c.symbol).toLowerCase().includes(q) ||
        c.contributingSignals.some((s) => s.handle.toLowerCase().includes(q))
      : true
  );

  const filteredSignals = state.signals.filter((s) =>
    q
      ? s.rawText.toLowerCase().includes(q) ||
        s.voiceName.toLowerCase().includes(q) ||
        s.mentions.some((m) => m.symbol.toLowerCase().includes(q))
      : true
  );

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5">
      {/* 1. Convergence Clusters Hero */}
      <section className="rounded-[28px] bg-[#0B0C0E] p-6 sm:p-7 text-white relative overflow-hidden">
        <div
          className="pointer-events-none absolute -bottom-24 left-[12%] h-[220px] w-[380px] rounded-full opacity-75 blur-[58px]"
          style={{
            background:
              'radial-gradient(circle, rgba(203,251,0,0.48) 0%, rgba(11,12,14,0) 75%)',
          }}
        />

        <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[22px] font-normal tracking-[-0.02em]">
                {isAr ? 'تقارب أصوات السوق' : 'Narrative convergence'}
              </h2>
              <span className="px-3 py-0.5 rounded-full bg-[#CBFB00] text-[#111214] text-[11.5px] font-medium">
                {isAr ? 'حتى 20 صوتاً' : 'Up to 20 voices'}
              </span>
            </div>
            <p className="text-[12.5px] text-[#9A9EA7] mt-1.5">
              {isAr
                ? `يتطلب اتفاق ${state.riskConfig.minConvergenceVoices} أصوات مستقلة على الأقل ومؤشر تقارب ${state.riskConfig.minNciScore}% مع توافق السعر.`
                : `Requires at least ${state.riskConfig.minConvergenceVoices} distinct voices and ${state.riskConfig.minNciScore}% score with cross-venue price alignment.`}
            </p>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredConvergences.slice(0, 6).map((c) => (
            <div
              key={c.id}
              onClick={() => onInspect({ type: 'convergence', data: c })}
              className="cursor-pointer rounded-[22px] bg-[#1D1F23]/92 hover:bg-[#24272D] border border-white/[0.07] p-5 transition space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <CoinAvatar symbol={c.symbol} size={32} darkBg />
                  <div>
                    <div className="text-[15px] font-medium text-white">
                      {formatCoinTitle(c.symbol)}
                    </div>
                    <div className="text-[11px] text-[#8E929B]">
                      {c.direction === 'LONG' ? 'Bullish bias' : 'Bearish bias'}{' '}
                      · ${c.spotPriceAtCheck.toLocaleString()}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                    c.passesThreshold
                      ? 'bg-[#CBFB00] text-[#111214]'
                      : 'bg-white/10 text-white/75'
                  }`}
                >
                  {c.passesThreshold ? 'Qualified' : 'Watching'}
                </span>
              </div>

              <div className="flex items-end justify-between pt-1 tabular-nums">
                <div>
                  <div className="text-[11px] text-[#8E929B]">
                    Convergence score
                  </div>
                  <div className="text-[22px] font-medium text-[#CBFB00]">
                    {c.nciScore}%
                  </div>
                </div>
                <div className="text-right text-[12px] text-white/80">
                  <div>{c.distinctVoices} distinct voices</div>
                  <div className="text-[11px] text-[#8E929B]">
                    Conviction {Math.round(c.avgConviction * 100)}% · Urgency{' '}
                    {Math.round(c.avgUrgency * 100)}%
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {c.contributingSignals.slice(0, 4).map((s) => (
                  <span
                    key={s.postHash}
                    className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[11px] text-white/80"
                  >
                    {formatCleanText(s.voiceName)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Post Analyzer + 20-Voice Roster */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] space-y-4">
          <div>
            <h3 className="text-[18px] font-medium text-[#111214]">
              {isAr
                ? 'إدخال منشور محلل حي'
                : 'Analyze a live creator post'}
            </h3>
            <p className="text-[12px] text-[#8D929C] mt-1">
              {isAr
                ? 'الصق أي منشور من إكس أو تيليجرام أو ديسكورد لاختبار استخراج العملات والقناعة وتحديث التقارب.'
                : 'Paste any live X, Telegram or Discord post to evaluate sentiment, conviction and convergence.'}
            </p>
          </div>

          <form onSubmit={handleInjectSubmit} className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <input
                type="text"
                value={postVoiceName}
                onChange={(e) => setPostVoiceName(e.target.value)}
                placeholder="Creator name"
                className="px-3.5 py-2.5 rounded-2xl border border-[#E7E9ED] text-[12.5px] focus:outline-none focus:border-[#111214]"
              />
              <input
                type="text"
                value={postHandle}
                onChange={(e) => setPostHandle(e.target.value)}
                placeholder="@handle"
                className="px-3.5 py-2.5 rounded-2xl border border-[#E7E9ED] text-[12.5px] focus:outline-none focus:border-[#111214]"
              />
              <select
                value={postPlatform}
                onChange={(e) =>
                  setPostPlatform(e.target.value as PlatformSource)
                }
                className="px-3 py-2.5 rounded-2xl border border-[#E7E9ED] text-[12.5px] bg-white focus:outline-none focus:border-[#111214]"
              >
                <option value="X">X</option>
                <option value="Telegram">Telegram</option>
                <option value="Discord">Discord</option>
              </select>
            </div>

            <textarea
              rows={3}
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder='Example: "Institutional wallets accumulated $45 million of Solana and withdrew from Coinbase, high conviction breakout today."'
              className="w-full p-3.5 rounded-2xl border border-[#E7E9ED] text-[12.5px] focus:outline-none focus:border-[#111214]"
            />

            <div className="flex items-center gap-2.5">
              <input
                type="text"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="Post link (optional)"
                className="flex-1 px-4 py-2.5 rounded-full border border-[#E7E9ED] text-[12.5px] focus:outline-none focus:border-[#111214]"
              />
              <button
                type="submit"
                disabled={isSubmittingPost || !postText.trim()}
                className="px-6 py-2.5 rounded-full bg-[#111214] hover:bg-black text-white text-[12.5px] font-medium transition disabled:opacity-50"
              >
                {isSubmittingPost
                  ? 'Evaluating...'
                  : isAr
                  ? 'تحليل وتحديث'
                  : 'Evaluate post'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-7 bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[18px] font-medium text-[#111214] tabular-nums">
                {isAr
                  ? `قائمة الأصوات المراقبة (${state.voices.length}/20)`
                  : `Monitored market voices (${state.voices.length}/20)`}
              </h3>
              <p className="text-[12px] text-[#8D929C] mt-0.5">
                Configure up to 20 creators across X, Telegram, Discord and research feeds.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleAddVoice}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-[#F5F6F8] p-2.5 rounded-2xl"
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Voice name"
              className="sm:col-span-3 px-3 py-2 rounded-xl bg-white border border-[#E7E9ED] text-[12px]"
            />
            <input
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="@handle or feed link"
              className="sm:col-span-3 px-3 py-2 rounded-xl bg-white border border-[#E7E9ED] text-[12px]"
            />
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as PlatformSource)}
              className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-white border border-[#E7E9ED] text-[12px]"
            >
              <option value="Telegram">Telegram</option>
              <option value="X">X</option>
              <option value="Discord">Discord</option>
              <option value="ResearchRSS">Research</option>
            </select>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as VoiceCategory)}
              className="sm:col-span-2 px-2.5 py-2 rounded-xl bg-white border border-[#E7E9ED] text-[12px]"
            >
              <option value="Alpha & Narrative">Narrative</option>
              <option value="On-Chain Whale">On-chain</option>
              <option value="Quant Research">Quant</option>
              <option value="Macro & Breaking">Macro</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-[#111214] text-white text-[12px] font-medium flex items-center justify-center gap-1"
            >
              <SFPlus className="w-3.5 h-3.5" /> Add
            </button>
          </form>

          <div className="max-h-[245px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1">
            {state.voices.map((v) => (
              <div
                key={v.id}
                className={`rounded-2xl border p-3.5 flex items-center justify-between gap-2 transition ${
                  v.enabled
                    ? 'border-[#F0F1F4] bg-white'
                    : 'border-dashed border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] font-medium text-[#111214] truncate">
                      {formatCleanText(v.name)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[#F5F6F8] text-[#555962]">
                      {v.platform === 'ResearchRSS' ? 'Feed' : v.platform}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8D929C] flex items-center gap-2 mt-0.5 tabular-nums">
                    <span>@{v.handle}</span>
                    <span>·</span>
                    <span>Trust {v.dynamicTrust.toFixed(2)}x</span>
                    {v.syncStatus === 'LIVE' && (
                      <span className="text-emerald-600 inline-flex items-center gap-0.5">
                        <SFCheckCircle className="w-3 h-3" /> Live
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggleVoice(v.id)}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                      v.enabled
                        ? 'bg-[#111214] text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {v.enabled ? 'Active' : 'Paused'}
                  </button>
                  <button
                    onClick={() => handleDeleteVoice(v.id)}
                    className="p-1.5 rounded-full text-[#9A9FA8] hover:text-rose-600 transition"
                  >
                    <SFClose className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Live Extracted Signals with Real Coin Logos */}
      <section className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2]">
        <h3 className="text-[18px] font-medium text-[#111214] mb-4 tabular-nums">
          {isAr
            ? `الإشارات المستخرجة من المنشورات الحية (${filteredSignals.length})`
            : `Live extracted token mentions (${filteredSignals.length})`}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[520px] overflow-y-auto pr-1">
          {filteredSignals.slice(0, 40).map((sig) => (
            <div
              key={sig.id}
              className="rounded-[22px] border border-[#F0F1F4] p-4 space-y-3 bg-[#FAFAFB] hover:bg-white transition"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <CoinAvatar
                    symbol={sig.mentions[0]?.symbol || 'BTC'}
                    size={32}
                  />
                  <div>
                    <div className="text-[12.5px] font-medium text-[#111214]">
                      {formatCleanText(sig.voiceName)}{' '}
                      <span className="text-[#8D929C] font-normal">
                        · {sig.platform === 'ResearchRSS' ? 'Feed' : sig.platform}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8D929C] tabular-nums">
                      {new Date(sig.publishedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <a
                  href={sig.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] text-[#555962] hover:text-[#111214] inline-flex items-center gap-1"
                >
                  Open <SFArrowUpRight className="w-3 h-3" />
                </a>
              </div>

              <p className="text-[12.5px] text-[#22252B] leading-relaxed line-clamp-3">
                {formatCleanText(sig.rawText)}
              </p>

              <div className="flex flex-wrap gap-2">
                {sig.mentions.map((m) => (
                  <div
                    key={m.symbol}
                    className={`pl-1.5 pr-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 tabular-nums ${
                      m.direction === 'BULLISH'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                        : m.direction === 'BEARISH'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200/60'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    <CoinAvatar symbol={m.symbol} size={18} />
                    <span>
                      {formatCoinTitle(m.symbol)} ·{' '}
                      {m.direction === 'BULLISH'
                        ? 'Bullish'
                        : m.direction === 'BEARISH'
                        ? 'Bearish'
                        : 'Neutral'}
                    </span>
                    <span className="opacity-75">
                      · Conv {Math.round(m.conviction * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
