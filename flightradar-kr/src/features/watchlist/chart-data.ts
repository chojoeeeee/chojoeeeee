import { providerSeries, selectMode } from "@/features/price-history/stats";
import type { PriceRow } from "./types";

/** Provider-separated chart data (one row per observation time), DEMO and LIVE never mixed. */
export function buildChartData(rows: PriceRow[], names: Record<string, string>) {
  const { mode, rows: usable } = selectMode(rows);
  const series = providerSeries(usable);
  const byTime = new Map<number, { t: number } & Record<string, number>>();
  for (const s of series) {
    for (const p of s.points) {
      const t = Date.parse(p.at);
      const row = byTime.get(t) ?? ({ t } as { t: number } & Record<string, number>);
      row[s.provider] = p.price;
      byTime.set(t, row);
    }
  }
  return {
    data: [...byTime.values()].sort((a, b) => a.t - b.t),
    providers: series.map((s) => ({ id: s.provider, label: names[s.provider] ?? s.provider })),
    isDemo: mode === "demo",
  };
}
