'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AuditChainView } from '@/components/AuditChainView';
import { DashboardBentoView } from '@/components/DashboardBentoView';
import { DebateAndHunterView } from '@/components/DebateAndHunterView';
import { InspectDrawer, InspectSubject } from '@/components/InspectDrawer';
import { KolRadarView } from '@/components/KolRadarView';
import { LuminHeader, NavTab } from '@/components/LuminHeader';
import { PracticeDeskView } from '@/components/PracticeDeskView';
import { RiskRulesView } from '@/components/RiskRulesView';
import {
  EngineState,
  KOLVoice,
  PlatformSource,
  RiskConfig,
  TrailRecord,
  VerificationReport,
} from '@/lib/types';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectSubject, setInspectSubject] = useState<InspectSubject>(null);

  const [state, setState] = useState<EngineState | null>(null);
  const [trailTail, setTrailTail] = useState<TrailRecord[]>([]);
  const [totalTrailRecords, setTotalTrailRecords] = useState<number>(0);
  const [verification, setVerification] = useState<VerificationReport | null>(
    null
  );
  const [isRunningCycle, setIsRunningCycle] = useState<boolean>(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const applyEnginePayload = useCallback(
    (payload: {
      state: EngineState;
      trailTail: TrailRecord[];
      totalTrailRecords: number;
      verification: VerificationReport;
    }) => {
      setState(payload.state);
      setTrailTail(payload.trailTail);
      setTotalTrailRecords(payload.totalTrailRecords);
      setVerification(payload.verification);
    },
    []
  );

  const loadEngine = useCallback(async () => {
    try {
      setIsRunningCycle(true);
      const res = await fetch('/api/engine', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        applyEnginePayload(data);
        setBootError(null);
      } else {
        setBootError(data.error || 'Failed to initialize engine');
      }
    } catch (err) {
      setBootError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRunningCycle(false);
    }
  }, [applyEnginePayload]);

  useEffect(() => {
    loadEngine();
  }, [loadEngine]);

  const handleRunCycle = useCallback(async () => {
    if (isRunningCycle) return;
    setIsRunningCycle(true);
    try {
      const res = await fetch('/api/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_cycle' }),
      });
      const data = await res.json();
      if (data.ok) applyEnginePayload(data);
    } finally {
      setIsRunningCycle(false);
    }
  }, [applyEnginePayload, isRunningCycle]);

  useEffect(() => {
    if (!autoSync) return;
    const timer = setInterval(() => {
      handleRunCycle();
    }, 60_000);
    return () => clearInterval(timer);
  }, [autoSync, handleRunCycle]);

  const handleSaveVoices = async (voices: KOLVoice[]) => {
    const res = await fetch('/api/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_voices', voices }),
    });
    const data = await res.json();
    if (data.ok) applyEnginePayload(data);
  };

  const handleInjectPost = async (customPost: {
    voiceName: string;
    handle: string;
    platform: PlatformSource;
    text: string;
    url?: string;
    trustWeight?: number;
  }) => {
    setIsRunningCycle(true);
    try {
      const res = await fetch('/api/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inject_post', customPost }),
      });
      const data = await res.json();
      if (data.ok) applyEnginePayload(data);
    } finally {
      setIsRunningCycle(false);
    }
  };

  const handleClosePosition = async (positionId: string) => {
    const res = await fetch('/api/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close_position', positionId }),
    });
    const data = await res.json();
    if (data.ok) applyEnginePayload(data);
  };

  const handleVerifyChain = async () => {
    const res = await fetch('/api/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_chain' }),
    });
    const data = await res.json();
    if (data.ok) applyEnginePayload(data);
  };

  const handleSaveRisk = async (riskConfig: Partial<RiskConfig>) => {
    const res = await fetch('/api/engine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_risk', riskConfig }),
    });
    const data = await res.json();
    if (data.ok) applyEnginePayload(data);
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#111214]">
      <LuminHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        autoSync={autoSync}
        setAutoSync={setAutoSync}
        isRunningCycle={isRunningCycle}
        onRunCycle={handleRunCycle}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        cycleCount={state?.cycleCount ?? 0}
        lastCycleAt={state?.lastCycleAt ?? null}
        verification={verification}
      />

      <main className="max-w-[1380px] mx-auto px-5 sm:px-9 pb-14">
        {bootError && (
          <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-[12.5px] text-rose-800">
            {bootError}
          </div>
        )}

        {!state ? (
          <div className="rounded-[28px] bg-[#0B0C0E] p-14 text-center text-white relative overflow-hidden">
            <div
              className="pointer-events-none absolute -bottom-20 left-1/3 w-96 h-48 rounded-full opacity-75 blur-[65px]"
              style={{
                background:
                  'radial-gradient(circle, rgba(203,251,0,0.42) 0%, rgba(11,12,14,0) 75%)',
              }}
            />
            <div className="relative z-10 space-y-3">
              <div className="w-9 h-9 mx-auto rounded-full border-2 border-[#CBFB00] border-t-transparent animate-spin" />
              <h2 className="text-[18px] font-normal">
                Syncing live market evidence & 20 voices...
              </h2>
              <p className="text-[12.5px] text-[#9A9EA7] max-w-md mx-auto">
                Connecting to Coinbase, Kraken, Hyperliquid, DexScreener and live market creator feeds.
              </p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardBentoView
                state={state}
                trailTail={trailTail}
                totalTrailRecords={totalTrailRecords}
                verification={verification}
                lang={lang}
                searchQuery={searchQuery}
                isRunningCycle={isRunningCycle}
                onRunCycle={handleRunCycle}
                onNavigate={setActiveTab}
                onInspect={setInspectSubject}
                onOpenInjectModal={() => setActiveTab('kol')}
              />
            )}

            {activeTab === 'kol' && (
              <KolRadarView
                state={state}
                lang={lang}
                searchQuery={searchQuery}
                onInspect={setInspectSubject}
                onSaveVoices={handleSaveVoices}
                onInjectPost={handleInjectPost}
              />
            )}

            {activeTab === 'debate' && (
              <DebateAndHunterView
                key="debate-tab"
                state={state}
                lang={lang}
                searchQuery={searchQuery}
                initialSubTab="debate"
                onInspect={setInspectSubject}
              />
            )}

            {activeTab === 'hunter' && (
              <DebateAndHunterView
                key="hunter-tab"
                state={state}
                lang={lang}
                searchQuery={searchQuery}
                initialSubTab="hunter"
                onInspect={setInspectSubject}
              />
            )}

            {activeTab === 'practice' && (
              <PracticeDeskView
                state={state}
                lang={lang}
                searchQuery={searchQuery}
                onInspect={setInspectSubject}
                onClosePosition={handleClosePosition}
              />
            )}

            {activeTab === 'audit' && (
              <AuditChainView
                trailTail={trailTail}
                totalTrailRecords={totalTrailRecords}
                verification={verification}
                lang={lang}
                searchQuery={searchQuery}
                onVerifyNow={handleVerifyChain}
                onInspect={setInspectSubject}
              />
            )}

            {activeTab === 'risk' && (
              <RiskRulesView
                riskConfig={state.riskConfig}
                lang={lang}
                onSaveRisk={handleSaveRisk}
              />
            )}
          </>
        )}
      </main>

      <InspectDrawer
        subject={inspectSubject}
        onClose={() => setInspectSubject(null)}
        onClosePosition={handleClosePosition}
        lang={lang}
      />
    </div>
  );
}
