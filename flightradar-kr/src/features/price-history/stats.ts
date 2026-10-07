import { isDemoRow, type PriceRow } from "@/features/watchlist/types";

/**
 * Price history maths. Everything here works on ONE data mode at a time:
 * if any real (non-demo) flight price exists only real rows are used; otherwise demo rows are
 * used and flagged. DEMO and LIVE prices are never averaged or compared with each other.
 * Deal rows (trigger_type = "deal") are not fares and are excluded from every price figure.
 */
export type DataMode = "live" | "demo" | "none";

export const STALE_AFTER_MS = 24 * 3_600_000;
const DAY = 86_400_000;

export function selectMode(rows: PriceRow[]): { mode: DataMode; rows: PriceRow[] } {
  const flights = rows.filter((r) => r.triggerType !== "deal");
  const live = flights.filter((r) => !isDemoRow(r));
  if (live.length > 0) return { mode: "live", rows: live };
  if (flights.length > 0) return { mode: "demo", rows: flights };
  return { mode: "none", rows: [] };
}

export interface RunPoint {
  at: string;
  price: number;
  row: PriceRow;
}

/** Cheapest price each provider reported in each refresh run. */
function providerRuns(rows: PriceRow[]): Map<string, RunPoint[]> {
  const best = new Map<string, Map<string, PriceRow>>(); // provider -> runId -> cheapest row
  for (const r of rows) {
    const byRun = best.get(r.provider) ?? new Map<string, PriceRow>();
    const cur = byRun.get(r.runId);
    if (!cur || r.price < cur.price) byRun.set(r.runId, r);
    best.set(r.provider, byRun);
  }
  const out = new Map<string, RunPoint[]>();
  for (const [provider, runs] of best) {
    out.set(
      provider,
      [...runs.values()].map((row) => ({ at: row.fetchedAt, price: row.price, row })).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    );
  }
  return out;
}

export interface ProviderSeries {
  provider: string;
  points: { at: string; price: number }[];
}

export function providerSeries(rows: PriceRow[]): ProviderSeries[] {
  return [...providerRuns(rows)].map(([provider, pts]) => ({ provider, points: pts.map((p) => ({ at: p.at, price: p.price })) }));
}

export interface CompositePoint {
  at: string;
  price: number;
  provider: string;
  row: PriceRow;
}

/**
 * "Best known price over time": at each refresh time, the cheapest of every provider's latest
 * known price at that time. A background run that could only ask one provider therefore never
 * looks like a price jump just because the others were not asked.
 */
export function compositeSeries(rows: PriceRow[]): CompositePoint[] {
  const runs = providerRuns(rows);
  const times = [...new Set([...runs.values()].flat().map((p) => p.at))].sort((a, b) => Date.parse(a) - Date.parse(b));
  const out: CompositePoint[] = [];
  for (const t of times) {
    let best: RunPoint | undefined;
    for (const pts of runs.values()) {
      const latest = [...pts].reverse().find((p) => Date.parse(p.at) <= Date.parse(t));
      if (latest && (!best || latest.price < best.price)) best = latest;
    }
    if (best) out.push({ at: t, price: best.price, provider: best.row.provider, row: best.row });
  }
  return out;
}

export interface CurrentPrice {
  price: number;
  provider: string;
  at: string;
  airline?: string;
  bookingUrl?: string;
  isDemo: boolean;
  /** Older than 24h → a reference price, not a fresh confirmation. */
  stale: boolean;
}

export function currentPrice(rows: PriceRow[], now: Date): CurrentPrice | undefined {
  const { mode, rows: usable } = selectMode(rows);
  const series = compositeSeries(usable);
  const last = series[series.length - 1];
  if (!last) return undefined;
  return {
    price: last.price,
    provider: last.provider,
    at: last.at,
    airline: last.row.airline,
    bookingUrl: last.row.bookingUrl,
    isDemo: mode === "demo",
    stale: now.getTime() - Date.parse(last.at) > STALE_AFTER_MS,
  };
}

export interface PriceStats {
  mode: DataMode;
  /** Number of observations in the composite series. */
  points: number;
  current?: CurrentPrice;
  previous?: number;
  registered?: number;
  recentLow?: number;
  recentHigh?: number;
  avg7?: number;
  avg30?: number;
  /** current − registered (negative = cheaper). Only when registered and current are the same data mode. */
  changeFromRegistered?: { amount: number; percent: number };
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);

export function priceStats(rows: PriceRow[], opts: { now: Date; registeredPrice?: number; registeredIsDemo?: boolean }): PriceStats {
  const { mode, rows: usable } = selectMode(rows);
  const series = compositeSeries(usable);
  const current = currentPrice(rows, opts.now);
  const within = (days: number) => series.filter((p) => opts.now.getTime() - Date.parse(p.at) <= days * DAY).map((p) => p.price);
  const last30 = within(30);

  const comparable = opts.registeredPrice !== undefined && current !== undefined && Boolean(opts.registeredIsDemo) === current.isDemo;
  return {
    mode,
    points: series.length,
    current,
    previous: series.length >= 2 ? series[series.length - 2]!.price : undefined,
    registered: opts.registeredPrice,
    recentLow: last30.length ? Math.min(...last30) : undefined,
    recentHigh: last30.length ? Math.max(...last30) : undefined,
    avg7: mean(within(7)),
    avg30: mean(last30),
    changeFromRegistered: comparable
      ? { amount: current!.price - opts.registeredPrice!, percent: Math.round(((current!.price - opts.registeredPrice!) / opts.registeredPrice!) * 1000) / 10 }
      : undefined,
  };
}

// ---------------------------------------------------------------- Deal Score

export interface DealScore {
  /** 0..100, or undefined when there is nothing to base a score on. */
  score?: number;
  label: "매우 좋은 가격" | "좋은 가격" | "보통" | "비싼 편" | "판단 불가";
  emoji: string;
  /** Observations used; below 3 the score is only a rough reference. */
  dataPoints: number;
  reference: boolean;
  components: { key: "target" | "average" | "low" | "drop"; weight: number; value: number }[];
}

/** Base weights from the spec: target 30 / vs average 30 / near recent low 20 / recent drop 20. */
export const SCORE_WEIGHTS = { target: 30, average: 30, low: 20, drop: 20 } as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function labelFor(score: number): Pick<DealScore, "label" | "emoji"> {
  if (score >= 80) return { label: "매우 좋은 가격", emoji: "🔥" };
  if (score >= 65) return { label: "좋은 가격", emoji: "👍" };
  if (score >= 40) return { label: "보통", emoji: "" };
  return { label: "비싼 편", emoji: "" };
}

/**
 * Basic (non-ML) deal score. Components that cannot be computed honestly are left out and the
 * remaining weights are renormalised — but only when at least TWO components remain, otherwise no score is given — e.g. there is no "vs average" until ≥ 3 earlier
 * observations exist, and no "target" component without a target price.
 *
 * `priorPrices` = composite prices BEFORE the current one (same data mode), oldest first.
 */
export function dealScore(input: { current: number; target?: number; priorPrices: number[] }): DealScore {
  const { current, target, priorPrices } = input;
  const comps: DealScore["components"] = [];

  if (target !== undefined && target > 0) {
    // 1 at/below target, fading to 0 when 30% above it.
    comps.push({ key: "target", weight: SCORE_WEIGHTS.target, value: current <= target ? 1 : clamp01(1 - (current - target) / target / 0.3) });
  }
  if (priorPrices.length >= 3) {
    const avg = priorPrices.reduce((a, b) => a + b, 0) / priorPrices.length;
    comps.push({ key: "average", weight: SCORE_WEIGHTS.average, value: clamp01((avg - current) / avg / 0.3) }); // 30% below average = full
  }
  if (priorPrices.length >= 1) {
    const low = Math.min(...priorPrices);
    comps.push({ key: "low", weight: SCORE_WEIGHTS.low, value: current <= low ? 1 : clamp01(1 - (current - low) / low / 0.2) });
    const prev = priorPrices[priorPrices.length - 1]!;
    comps.push({ key: "drop", weight: SCORE_WEIGHTS.drop, value: clamp01((prev - current) / prev / 0.15) }); // 15% drop = full
  }

  const dataPoints = priorPrices.length + 1;
  // One component alone would be renormalised to a misleading 0–100 (e.g. "target only" → "very good" while still above target).
  if (comps.length < 2) return { label: "판단 불가", emoji: "", dataPoints, reference: true, components: comps };
  const total = comps.reduce((a, c) => a + c.weight, 0);
  const score = Math.round((comps.reduce((a, c) => a + c.weight * c.value, 0) / total) * 100);
  return { score, ...labelFor(score), dataPoints, reference: dataPoints < 3, components: comps };
}
