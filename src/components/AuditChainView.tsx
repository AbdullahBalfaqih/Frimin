'use client';

import React, { useState } from 'react';
import {
  SFCheckCircle,
  SFDownload,
  SFRefresh,
  SFShield,
} from './AppleIcons';
import { CoinAvatar, formatCleanText } from './CoinAvatar';
import { InspectSubject } from './InspectDrawer';
import { TrailKind, TrailRecord, VerificationReport } from '@/lib/types';

interface AuditChainViewProps {
  trailTail: TrailRecord[];
  totalTrailRecords: number;
  verification: VerificationReport | null;
  lang: 'en' | 'ar';
  searchQuery: string;
  onVerifyNow: () => Promise<void>;
  onInspect: (s: InspectSubject) => void;
}

const KIND_LABELS: { id: 'ALL' | TrailKind; label: string }[] = [
  { id: 'ALL', label: 'All records' },
  { id: 'PRACTICE_OPEN', label: 'Opened positions' },
  { id: 'PRACTICE_CLOSE', label: 'Settled positions' },
  { id: 'PRACTICE_REJECTED', label: 'Risk gates' },
  { id: 'CONVERGENCE_CLUSTER', label: 'Voice convergence' },
  { id: 'BULL_BEAR_DEBATE', label: 'Market debates' },
  { id: 'TOKEN_HUNTER_SCREEN', label: 'Token scanner' },
  { id: 'NEWS_VERIFICATION', label: 'News verifier' },
  { id: 'WHALE_VERDICT', label: 'Whale flows' },
  { id: 'ONCHAIN_RPC_EVIDENCE', label: 'On-chain blocks' },
  { id: 'MARKET_EVIDENCE', label: 'Market snapshots' },
];

function humanizeKind(k: TrailKind): string {
  const found = KIND_LABELS.find((item) => item.id === k);
  if (found) return found.label;
  return k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function AuditChainView({
  trailTail,
  totalTrailRecords,
  verification,
  lang,
  searchQuery,
  onVerifyNow,
  onInspect,
}: AuditChainViewProps) {
  const isAr = lang === 'ar';
  const [kindFilter, setKindFilter] = useState<'ALL' | TrailKind>('ALL');
  const [verifying, setVerifying] = useState(false);
  const q = searchQuery.trim().toLowerCase();

  const filtered = trailTail.filter((r) => {
    if (kindFilter !== 'ALL' && r.kind !== kindFilter) return false;
    if (q) {
      return (
        r.summary.toLowerCase().includes(q) ||
        r.hash.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await onVerifyNow();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5">
      {/* Verification Hero */}
      <section className="rounded-[28px] bg-[#0B0C0E] p-6 sm:p-7 text-white relative overflow-hidden">
        <div
          className="pointer-events-none absolute -bottom-24 left-[12%] h-[220px] w-[380px] rounded-full opacity-75 blur-[58px]"
          style={{
            background:
              'radial-gradient(circle, rgba(203,251,0,0.45) 0%, rgba(11,12,14,0) 75%)',
          }}
        />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#CBFB00] text-[#111214] text-[12px] font-medium">
              <SFShield className="w-4 h-4" />
              <span>
                {verification?.valid !== false
                  ? `Ed25519 signed & Sqlite synced (${verification?.ed25519SignaturesVerified ?? totalTrailRecords} signatures)`
                  : 'Chain verification warning'}
              </span>
            </div>
            <h2 className="text-[21px] font-normal tracking-[-0.02em] pt-1 tabular-nums">
              {isAr
                ? `تم التحقق التشفيري من ${verification?.checkedRecords ?? totalTrailRecords} سجلاً مترابطاً`
                : `${verification?.checkedRecords ?? totalTrailRecords} sequential records verified from genesis`}
            </h2>
            <div className="font-mono text-[11px] text-[#9A9EA7] space-y-0.5 pt-1">
              <div>Genesis · {verification?.genesisHash ?? '--'}</div>
              <div>Head    · {verification?.headHash ?? '--'}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="px-5 py-2.5 rounded-full bg-[#CBFB00] hover:brightness-95 text-[#111214] text-[12.5px] font-medium flex items-center gap-2 transition"
            >
              <SFRefresh
                className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`}
              />
              {verifying
                ? 'Verifying hashes...'
                : isAr
                ? 'التحقق من السلسلة الآن'
                : 'Verify chain'}
            </button>

            <a
              href="/api/trail?format=jsonl"
              className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-[12.5px] font-medium flex items-center gap-2 border border-white/10 transition"
            >
              <SFDownload className="w-4 h-4" />
              Download frimin-trail.jsonl
            </a>
          </div>
        </div>
      </section>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-1.5">
        {KIND_LABELS.map((item) => (
          <button
            key={item.id}
            onClick={() => setKindFilter(item.id)}
            className={`px-4 py-1.5 rounded-full text-[12px] transition ${
              kindFilter === item.id
                ? 'bg-[#111214] text-white font-medium'
                : 'bg-white border border-[#EFEFF2] text-[#555962] hover:text-[#111214]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Blocks List */}
      <section className="space-y-3">
        {filtered.map((rec) => {
          const sym = String(
            (rec.payload as Record<string, unknown>)?.symbol || ''
          );
          return (
            <div
              key={rec.hash}
              onClick={() => onInspect({ type: 'trail', data: rec })}
              className="cursor-pointer bg-white rounded-[24px] p-5 border border-[#EFEFF2] hover:border-[#111214] transition space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {sym ? (
                    <CoinAvatar symbol={sym} size={28} />
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-[#111214] text-white text-[11px] font-medium tabular-nums">
                      #{rec.index}
                    </span>
                  )}
                  <span className="px-3 py-0.5 rounded-full bg-[#F5F6F8] text-[#111214] text-[11.5px] font-medium">
                    {humanizeKind(rec.kind)}
                  </span>
                  <span className="text-[11.5px] text-[#8D929C] tabular-nums">
                    Record #{rec.index} ·{' '}
                    {new Date(rec.timestamp).toLocaleString()}
                  </span>
                </div>

                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-emerald-700 font-medium">
                  <SFCheckCircle className="w-3.5 h-3.5" />
                  Hash verified
                </span>
              </div>

              <p className="text-[13.5px] font-normal text-[#111214] leading-relaxed">
                {formatCleanText(rec.summary)}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 font-mono text-[10.5px] text-[#555962]">
                <div className="truncate bg-[#F5F6F8] px-3 py-1.5 rounded-xl">
                  <strong className="text-[#111214] font-sans font-medium">
                    Hash:{' '}
                  </strong>
                  {rec.hash}
                </div>
                <div className="truncate bg-[#F5F6F8] px-3 py-1.5 rounded-xl">
                  <strong className="text-[#111214] font-sans font-medium">
                    Previous:{' '}
                  </strong>
                  {rec.prevHash}
                </div>
                <div className="truncate bg-[#F5F6F8] px-3 py-1.5 rounded-xl font-sans">
                  <strong className="text-[#111214] font-medium">
                    Evidence inputs:{' '}
                  </strong>
                  {rec.evidenceHashes.length} records
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
