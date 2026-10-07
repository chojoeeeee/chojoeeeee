"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKrw } from "@/lib/format";

export interface ChartData {
  /** One entry per observation time; keys are provider ids (plus "t"). */
  data: ({ t: number } & Record<string, number>)[];
  providers: { id: string; label: string }[];
  isDemo: boolean;
}

const RANGES = [
  { key: "7", label: "7일", days: 7 },
  { key: "30", label: "30일", days: 30 },
  { key: "90", label: "90일", days: 90 },
  { key: "all", label: "전체", days: undefined },
] as const;

// Colour-blind-safe categorical palette (one colour per provider).
const COLORS = ["#2563eb", "#d97706", "#059669", "#9333ea", "#dc2626", "#0891b2"];

const md = (t: number) => {
  const d = new Date(t + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const mdhm = (t: number) => {
  const d = new Date(t + 9 * 3_600_000);
  return `${md(t)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function PriceChart({ chart, now }: { chart: ChartData; now: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30");
  const days = RANGES.find((r) => r.key === range)?.days;
  const data = useMemo(() => (days === undefined ? chart.data : chart.data.filter((p) => now - p.t <= days * 86_400_000)), [chart.data, days, now]);

  return (
    <section className="space-y-2 rounded-2xl border border-line bg-card p-4" aria-label="가격 변화 그래프">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">가격 변화{chart.isDemo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">DEMO DATA</span>}</h2>
        <div className="flex gap-1" role="group" aria-label="기간">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={r.key === range} className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${r.key === range ? "border-brand bg-brand text-white" : "border-line"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">이 기간에 기록된 가격이 없어요.</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={md} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(n: number) => `${Math.round(n / 10000)}만`} tick={{ fontSize: 11 }} width={40} domain={["auto", "auto"]} />
              <Tooltip labelFormatter={(t) => mdhm(Number(t))} formatter={(v) => formatKrw(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {chart.providers.map((p, i) => (
                <Line key={p.id} type="monotone" dataKey={p.id} name={p.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-[11px] text-muted">Provider별 최저가를 따로 보여줘요. 값은 1인 기준입니다.</p>
    </section>
  );
}
