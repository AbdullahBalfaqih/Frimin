'use client';

import React, { useState } from 'react';
import { SFCheckCircle, SFShield } from './AppleIcons';
import { RiskConfig } from '@/lib/types';

interface RiskRulesViewProps {
  riskConfig: RiskConfig;
  lang: 'en' | 'ar';
  onSaveRisk: (partial: Partial<RiskConfig>) => Promise<void>;
}

export function RiskRulesView({
  riskConfig,
  lang,
  onSaveRisk,
}: RiskRulesViewProps) {
  const isAr = lang === 'ar';
  const [form, setForm] = useState<RiskConfig>({ ...riskConfig });
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveRisk(form);
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const numField = (
    label: string,
    key: keyof RiskConfig,
    step = '0.5',
    min = '0'
  ) => (
    <div className="space-y-1.5">
      <label className="text-[12px] text-[#555962]">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        value={Number(form[key] ?? 0)}
        onChange={(e) =>
          setForm({ ...form, [key]: parseFloat(e.target.value) || 0 })
        }
        className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E7E9ED] text-[13px] font-medium text-[#111214] tabular-nums focus:outline-none focus:border-[#111214]"
      />
    </div>
  );

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-medium text-[#111214]">
              {isAr
                ? 'حدود المخاطر وبوابات التقارب'
                : 'Portfolio risk limits & signal gates'}
            </h3>
            <p className="text-[12px] text-[#8D929C] mt-0.5">
              Updates are appended directly onto the verifiable audit trail.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-full bg-[#111214] hover:bg-black text-white text-[12.5px] font-medium transition"
          >
            {saving ? 'Saving...' : isAr ? 'حفظ الإعدادات' : 'Save changes'}
          </button>
        </div>

        {savedNotice && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-[12.5px] text-emerald-800 flex items-center gap-2">
            <SFCheckCircle className="w-4 h-4" />
            <span>Risk rules saved and committed to the hash chain.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {numField('Max position size (% equity)', 'maxPositionPct', '0.5', '1')}
          {numField('Max total exposure (% equity)', 'maxTotalExposurePct', '1', '5')}
          {numField('Max concurrent positions', 'maxOpenPositions', '1', '1')}
          {numField('Risk per trade (%)', 'riskPerTradePct', '0.1', '0.2')}
          {numField('Default stop-loss (%)', 'defaultStopLossPct', '0.25', '0.5')}
          {numField('Default take-profit (%)', 'defaultTakeProfitPct', '0.5', '1')}
          {numField('Min distinct voices', 'minConvergenceVoices', '1', '1')}
          {numField('Min convergence score (%)', 'minNciScore', '1', '15')}
          {numField('Convergence window (hours)', 'convergenceWindowHours', '1', '2')}
          {numField('Time-stop expiry (hours)', 'timeStopHours', '1', '4')}
          {numField('Per-token cooldown (hours)', 'tokenCooldownHours', '1', '0')}
          {numField('Max venue spread (%)', 'maxCrossVenueSpreadPct', '0.1', '0.2')}
        </div>

        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F5F6F8]">
          <div>
            <div className="text-[13px] font-medium text-[#111214]">
              Allow practice short positions
            </div>
            <div className="text-[11.5px] text-[#8D929C]">
              When turned off, bearish convergences are logged without opening short positions.
            </div>
          </div>
          <input
            type="checkbox"
            checked={form.allowShorts}
            onChange={(e) =>
              setForm({ ...form, allowShorts: e.target.checked })
            }
            className="w-5 h-5 accent-[#111214]"
          />
        </div>

        <div className="pt-3 border-t border-[#EFEFF2] space-y-3">
          <div className="text-[13px] font-medium text-[#111214]">
            Optional read-only social connectors (no exchange keys)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="password"
              value={form.xBearerToken || ''}
              onChange={(e) =>
                setForm({ ...form, xBearerToken: e.target.value })
              }
              placeholder="X read-only bearer token (optional)"
              className="px-3.5 py-2.5 rounded-2xl border border-[#E7E9ED] text-[12.5px]"
            />
            <input
              type="password"
              value={form.discordBotToken || ''}
              onChange={(e) =>
                setForm({ ...form, discordBotToken: e.target.value })
              }
              placeholder="Discord read-only bot token (optional)"
              className="px-3.5 py-2.5 rounded-2xl border border-[#E7E9ED] text-[12.5px]"
            />
          </div>
        </div>
      </form>

      <div className="lg:col-span-5 bg-[#0B0C0E] text-white rounded-[28px] p-6 sm:p-7 space-y-4 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -bottom-16 right-8 w-64 h-40 rounded-full opacity-75 blur-[55px]"
          style={{
            background:
              'radial-gradient(circle, rgba(203,251,0,0.38) 0%, rgba(11,12,14,0) 75%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-2 text-[#CBFB00] text-[12px] font-medium">
          <SFShield className="w-4 h-4" />
          Transparent deterministic rulebook
        </div>
        <h3 className="relative z-10 text-[20px] font-normal tracking-[-0.02em]">
          Repeatable decisions from raw market evidence
        </h3>
        <div className="relative z-10 space-y-3 text-[12.5px] text-white/80 leading-relaxed">
          <div className="p-4 rounded-[20px] bg-white/[0.05] border border-white/[0.08]">
            <strong className="text-[#CBFB00] font-medium">
              1. Clause-level sentiment:
            </strong>{' '}
            Multi-asset posts are segmented into clauses before scoring conviction and urgency, penalizing uncertain or rumor phrasing.
          </div>
          <div className="p-4 rounded-[20px] bg-white/[0.05] border border-white/[0.08]">
            <strong className="text-[#CBFB00] font-medium">
              2. Distinct-voice convergence:
            </strong>{' '}
            Counts unique market voices within the sliding window so repeated posts from one creator never simulate consensus.
          </div>
          <div className="p-4 rounded-[20px] bg-white/[0.05] border border-white/[0.08]">
            <strong className="text-[#CBFB00] font-medium">
              3. Symmetric bull & bear debate:
            </strong>{' '}
            Opposing agents argue over the exact same content-addressed evidence hashes before the judge scores net edge.
          </div>
          <div className="p-4 rounded-[20px] bg-white/[0.05] border border-white/[0.08]">
            <strong className="text-[#CBFB00] font-medium">
              4. Unified atomic sizing:
            </strong>{' '}
            Entry, volatility stop-loss, take-profit and position size are computed as one decision with zero exchange keys.
          </div>
        </div>
      </div>
    </div>
  );
}
