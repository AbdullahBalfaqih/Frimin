'use client';

import React from 'react';
import { SFCheckCircle } from './AppleIcons';
import { CoinAvatar, formatCleanText, formatCoinTitle } from './CoinAvatar';
import { InspectSubject } from './InspectDrawer';
import { EngineState } from '@/lib/types';

interface PracticeDeskViewProps {
  state: EngineState;
  lang: 'en' | 'ar';
  searchQuery: string;
  onInspect: (s: InspectSubject) => void;
  onClosePosition: (id: string) => Promise<void>;
}

function formatStrategyClean(s: string): string {
  if (s === 'KOL_CONVERGENCE') return 'Voice convergence';
  if (s === 'ATOMIC_BUY_THE_DIP') return 'Dip entry';
  if (s === 'DEBATE_CONSENSUS') return 'Judge consensus';
  return 'Practice rule';
}

export function PracticeDeskView({
  state,
  lang,
  searchQuery,
  onInspect,
  onClosePosition,
}: PracticeDeskViewProps) {
  const isAr = lang === 'ar';
  const q = searchQuery.trim().toLowerCase();

  const openPositions = state.positions.filter((p) => p.status === 'OPEN');
  const closedPositions = state.positions.filter((p) => p.status !== 'OPEN');

  const exposureUsd = openPositions.reduce((s, p) => s + p.notionalUsd, 0);
  const unrealizedUsd = openPositions.reduce(
    (s, p) => s + p.unrealizedPnlUsd,
    0
  );
  const totalEquityUsd = Number(
    (state.cashUsd + exposureUsd + unrealizedUsd).toFixed(2)
  );
  const wins = closedPositions.filter(
    (p) => (p.realizedPnlUsd ?? 0) > 0
  ).length;
  const winRate =
    closedPositions.length > 0
      ? Math.round((wins / closedPositions.length) * 100)
      : 0;

  const eqPoints = state.equityHistory.map((e) => e.equityUsd);
  const minEq = Math.min(...eqPoints, state.riskConfig.initialEquityUsd * 0.99);
  const maxEq = Math.max(...eqPoints, state.riskConfig.initialEquityUsd * 1.01);
  const rangeEq = Math.max(1, maxEq - minEq);
  const svgPoints = eqPoints
    .map((val, idx) => {
      const x =
        eqPoints.length <= 1 ? 300 : (idx / (eqPoints.length - 1)) * 600;
      const y = 88 - ((val - minEq) / rangeEq) * 72;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const filterPos = (list: typeof state.positions) =>
    list.filter((p) =>
      q
        ? p.symbol.toLowerCase().includes(q) ||
          formatCoinTitle(p.symbol).toLowerCase().includes(q)
        : true
    );

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-5">
      {/* Portfolio Summary & Trajectory */}
      <section className="rounded-[28px] bg-[#0B0C0E] p-6 sm:p-7 text-white relative overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div
          className="pointer-events-none absolute -bottom-24 left-[12%] h-[220px] w-[380px] rounded-full opacity-75 blur-[58px]"
          style={{
            background:
              'radial-gradient(circle, rgba(203,251,0,0.45) 0%, rgba(11,12,14,0) 75%)',
          }}
        />

        <div className="lg:col-span-7 relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3.5 tabular-nums">
          <div className="p-4 rounded-[20px] bg-white/[0.06] border border-white/[0.08]">
            <div className="text-[11.5px] text-[#9A9EA7]">Paper equity</div>
            <div className="text-[20px] font-medium text-[#CBFB00] mt-1">
              ${totalEquityUsd.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#7E828B] mt-0.5">
              Base ${state.riskConfig.initialEquityUsd.toLocaleString()}
            </div>
          </div>

          <div className="p-4 rounded-[20px] bg-white/[0.06] border border-white/[0.08]">
            <div className="text-[11.5px] text-[#9A9EA7]">Available cash</div>
            <div className="text-[20px] font-medium text-white mt-1">
              ${state.cashUsd.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#7E828B] mt-0.5">
              Paper reserve
            </div>
          </div>

          <div className="p-4 rounded-[20px] bg-white/[0.06] border border-white/[0.08]">
            <div className="text-[11.5px] text-[#9A9EA7]">Active exposure</div>
            <div className="text-[20px] font-medium text-white mt-1">
              ${Math.round(exposureUsd).toLocaleString()}
            </div>
            <div className="text-[11px] text-[#7E828B] mt-0.5">
              Limit {state.riskConfig.maxTotalExposurePct}%
            </div>
          </div>

          <div className="p-4 rounded-[20px] bg-white/[0.06] border border-white/[0.08]">
            <div className="text-[11.5px] text-[#9A9EA7]">Win rate</div>
            <div className="text-[20px] font-medium text-white mt-1">
              {closedPositions.length > 0 ? `${winRate}%` : 'Live'}
            </div>
            <div className="text-[11px] text-[#7E828B] mt-0.5">
              Realized {state.realizedPnlUsd >= 0 ? '+' : ''}$
              {state.realizedPnlUsd.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 relative z-10 bg-white/[0.05] border border-white/[0.08] rounded-[22px] p-4">
          <div className="flex items-center justify-between text-[12px] mb-2">
            <span className="text-white/80">Equity curve</span>
            <span className="text-[#CBFB00] text-[11px]">
              Paper simulation · 0 keys
            </span>
          </div>
          <svg viewBox="0 0 600 96" className="w-full h-24 overflow-visible">
            <polyline
              fill="none"
              stroke="#CBFB00"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={svgPoints}
            />
          </svg>
        </div>
      </section>

      {/* Open Practice Positions */}
      <section className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2]">
        <h3 className="text-[18px] font-medium text-[#111214] mb-4 tabular-nums">
          {isAr
            ? `الصفقات المفتوحة حالياً (${openPositions.length}/${state.riskConfig.maxOpenPositions})`
            : `Open practice positions (${openPositions.length}/${state.riskConfig.maxOpenPositions})`}
        </h3>

        {filterPos(openPositions).length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[#8D929C] bg-[#F5F6F8] rounded-[20px]">
            No open practice positions match your current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-[#EFEFF2] text-[#8D929C] text-[11.5px] font-normal">
                  <th className="py-3 px-3 font-normal">Currency</th>
                  <th className="py-3 px-3 font-normal">Signal source</th>
                  <th className="py-3 px-3 font-normal">Entry → Live</th>
                  <th className="py-3 px-3 font-normal">Size & risk</th>
                  <th className="py-3 px-3 font-normal">Stop / Target</th>
                  <th className="py-3 px-3 font-normal">Return</th>
                  <th className="py-3 px-3 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filterPos(openPositions).map((p) => {
                  const posPnl = p.unrealizedPnlUsd >= 0;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-[#F5F6F8] hover:bg-[#FAFAFB] transition"
                    >
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          <CoinAvatar symbol={p.symbol} size={32} />
                          <div>
                            <div className="font-medium text-[#111214]">
                              {formatCoinTitle(p.symbol)}
                            </div>
                            <div className="text-[11px] text-[#8D929C]">
                              {p.side === 'LONG' ? 'Long position' : 'Short position'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-[#555962]">
                        {formatStrategyClean(p.strategy)}
                      </td>
                      <td className="py-3.5 px-3 text-[#111214]">
                        ${p.entryPrice.toLocaleString()} → $
                        {p.currentPrice.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-medium text-[#111214]">
                          ${p.notionalUsd}
                        </span>{' '}
                        <span className="text-[#8D929C] text-[11.5px]">
                          (${p.riskAmountUsd} risk)
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-[12px]">
                        <span className="text-rose-600">${p.stopLoss}</span> /{' '}
                        <span className="text-emerald-700">${p.takeProfit}</span>
                      </td>
                      <td
                        className={`py-3.5 px-3 font-medium ${
                          posPnl ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {posPnl ? '+' : ''}${p.unrealizedPnlUsd.toFixed(2)} (
                        {posPnl ? '+' : ''}
                        {p.unrealizedPnlPct}%)
                      </td>
                      <td className="py-3.5 px-3 text-right space-x-2">
                        <button
                          onClick={() =>
                            onInspect({ type: 'position', data: p })
                          }
                          className="px-3.5 py-1.5 rounded-full bg-[#F5F6F8] hover:bg-[#111214] hover:text-white text-[12px] font-medium transition"
                        >
                          Proof
                        </button>
                        <button
                          onClick={() => onClosePosition(p.id)}
                          className="px-3.5 py-1.5 rounded-full border border-[#E7E9ED] hover:border-rose-500 hover:text-rose-600 text-[12px] font-medium transition"
                        >
                          Settle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Settled Positions + Risk-Filtered Signals */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] space-y-3.5">
          <h3 className="text-[17px] font-medium text-[#111214] flex items-center gap-2 tabular-nums">
            <SFCheckCircle className="w-4 h-4 text-emerald-600" />
            {isAr
              ? `الصفقات المغلقة (${closedPositions.length})`
              : `Settled practice positions (${closedPositions.length})`}
          </h3>

          {filterPos(closedPositions).length === 0 ? (
            <p className="text-[12.5px] text-[#8D929C] py-6 text-center bg-[#F5F6F8] rounded-[20px]">
              Positions settle automatically when live price reaches stop-loss or take-profit, or manually via Settle.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {filterPos(closedPositions).map((p) => {
                const pnl = p.realizedPnlUsd ?? 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => onInspect({ type: 'position', data: p })}
                    className="cursor-pointer rounded-[20px] border border-[#F0F1F4] hover:border-[#111214] p-4 flex items-center justify-between transition tabular-nums"
                  >
                    <div className="flex items-center gap-3">
                      <CoinAvatar symbol={p.symbol} size={32} />
                      <div>
                        <div className="text-[13px] font-medium text-[#111214]">
                          {formatCoinTitle(p.symbol)} ·{' '}
                          {p.side === 'LONG' ? 'Long' : 'Short'}
                        </div>
                        <div className="text-[11.5px] text-[#8D929C]">
                          ${p.entryPrice} → ${p.exitPrice}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`text-[13px] font-medium ${
                        pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({p.realizedPnlPct}
                      %)
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#EFEFF2] space-y-3.5">
          <h3 className="text-[17px] font-medium text-[#111214] tabular-nums">
            {isAr
              ? `الإشارات المفلترة ببوابات المخاطر (${state.skippedSignals.length})`
              : `Signals filtered by risk limits (${state.skippedSignals.length})`}
          </h3>

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {state.skippedSignals.length === 0 ? (
              <p className="text-[12.5px] text-[#8D929C] py-6 text-center bg-[#F5F6F8] rounded-[20px]">
                No candidate signals have been blocked yet.
              </p>
            ) : (
              state.skippedSignals.map((s) => (
                <div
                  key={s.id}
                  className="rounded-[20px] border border-[#F0F1F4] p-4 flex items-center gap-3.5 bg-[#FAFAFB]"
                >
                  <CoinAvatar symbol={s.symbol} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-[#111214]">
                        {formatCoinTitle(s.symbol)} ·{' '}
                        {s.side === 'LONG' ? 'Long' : 'Short'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-800">
                        {formatCleanText(s.gateFailed)}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#555962] mt-0.5">
                      {formatCleanText(s.detailedReason)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
