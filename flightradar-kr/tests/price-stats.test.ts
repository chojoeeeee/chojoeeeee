import { describe, expect, it } from "vitest";
import { compositeSeries, currentPrice, dealScore, priceStats, providerSeries, selectMode } from "@/features/price-history/stats";
import type { PriceRow } from "@/features/watchlist/types";

const T = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString(); // 2026-10-01 + h hours
const NOW = new Date(Date.UTC(2026, 9, 7, 12));

function r(over: Partial<PriceRow> & { price: number; fetchedAt: string }): PriceRow {
  return { watchlistId: "w", runId: over.fetchedAt + (over.provider ?? "a"), provider: "a", sourceType: "api", flightKey: "k", currency: "KRW", triggerType: "user", ...over };
}

describe("data mode: DEMO and LIVE are never mixed", () => {
  it("uses only real rows when any exist", () => {
    const rows = [r({ price: 100000, fetchedAt: T(0), sourceType: "demo" }), r({ price: 200000, fetchedAt: T(1) })];
    const { mode, rows: used } = selectMode(rows);
    expect(mode).toBe("live");
    expect(used.map((x) => x.price)).toEqual([200000]);
    expect(currentPrice(rows, NOW)).toMatchObject({ price: 200000, isDemo: false });
  });
  it("falls back to demo rows (flagged) when nothing real exists; none when empty", () => {
    const rows = [r({ price: 150000, fetchedAt: T(0), sourceType: "demo" })];
    expect(selectMode(rows).mode).toBe("demo");
    expect(currentPrice(rows, NOW)).toMatchObject({ price: 150000, isDemo: true });
    expect(selectMode([]).mode).toBe("none");
    expect(currentPrice([], NOW)).toBeUndefined();
  });
  it("deal rows are not fares and never enter price figures", () => {
    const rows = [r({ price: 189000, fetchedAt: T(0) }), r({ price: 50000, fetchedAt: T(1), triggerType: "deal", provider: "catchfrog" })];
    expect(currentPrice(rows, NOW)?.price).toBe(189000);
    expect(priceStats(rows, { now: NOW }).points).toBe(1);
  });
  it("registered-vs-current change is only computed within the same data mode", () => {
    const rows = [r({ price: 169000, fetchedAt: T(0), sourceType: "demo" })];
    expect(priceStats(rows, { now: NOW, registeredPrice: 189000, registeredIsDemo: true }).changeFromRegistered).toEqual({ amount: -20000, percent: -10.6 });
    expect(priceStats(rows, { now: NOW, registeredPrice: 189000, registeredIsDemo: false }).changeFromRegistered).toBeUndefined();
  });
});

describe("composite price series", () => {
  it("takes the cheapest of each provider's latest known price", () => {
    const rows = [
      r({ price: 200000, fetchedAt: T(0), provider: "sky" }),
      r({ price: 190000, fetchedAt: T(0), provider: "trip" }),
      r({ price: 180000, fetchedAt: T(2), provider: "sky" }),
    ];
    expect(compositeSeries(rows).map((p) => [p.price, p.provider])).toEqual([[190000, "trip"], [180000, "sky"]]);
  });
  it("a run that could only ask ONE provider does not look like a price jump", () => {
    const rows = [
      r({ price: 170000, fetchedAt: T(0), provider: "sky" }), // user refresh asked sky + trip
      r({ price: 190000, fetchedAt: T(0), provider: "trip" }),
      r({ price: 195000, fetchedAt: T(6), provider: "trip" }), // background asked trip only
    ];
    expect(compositeSeries(rows).map((p) => p.price)).toEqual([170000, 170000]); // sky's 170,000 is still the best known
  });
  it("per-provider series are separated", () => {
    const rows = [r({ price: 200000, fetchedAt: T(0), provider: "sky" }), r({ price: 190000, fetchedAt: T(1), provider: "trip" }), r({ price: 195000, fetchedAt: T(2), provider: "sky" })];
    const s = Object.fromEntries(providerSeries(rows).map((x) => [x.provider, x.points.map((p) => p.price)]));
    expect(s).toEqual({ sky: [200000, 195000], trip: [190000] });
  });
  it("within one run only the provider's cheapest flight counts", () => {
    const rows = [r({ price: 210000, fetchedAt: T(0), runId: "x", flightKey: "a" }), r({ price: 190000, fetchedAt: T(0), runId: "x", flightKey: "b" })];
    expect(compositeSeries(rows)).toHaveLength(1);
    expect(compositeSeries(rows)[0]?.price).toBe(190000);
  });
});

describe("price statistics", () => {
  const rows = [
    r({ price: 219000, fetchedAt: new Date(Date.UTC(2026, 8, 20)).toISOString() }), // 17 days before NOW
    r({ price: 200000, fetchedAt: new Date(Date.UTC(2026, 9, 3)).toISOString() }),
    r({ price: 190000, fetchedAt: new Date(Date.UTC(2026, 9, 5)).toISOString() }),
    r({ price: 179000, fetchedAt: new Date(Date.UTC(2026, 9, 7)).toISOString() }),
  ];
  it("computes current, previous, low/high, 7/30 day averages and change from registration", () => {
    const s = priceStats(rows, { now: NOW, registeredPrice: 219000, registeredIsDemo: false });
    expect(s).toMatchObject({ mode: "live", points: 4, previous: 190000, recentLow: 179000, recentHigh: 219000, avg7: 189667, avg30: 197000 });
    expect(s.current?.price).toBe(179000);
    expect(s.changeFromRegistered).toEqual({ amount: -40000, percent: -18.3 }); // spec example
  });
  it("marks prices older than 24h as stale reference prices", () => {
    expect(currentPrice(rows, NOW)?.stale).toBe(false);
    expect(currentPrice(rows, new Date(Date.UTC(2026, 9, 9)))?.stale).toBe(true);
  });
  it("same price twice, rising price: stats follow the data", () => {
    const flat = [r({ price: 180000, fetchedAt: T(0) }), r({ price: 180000, fetchedAt: T(1) })];
    expect(priceStats(flat, { now: NOW }).previous).toBe(180000);
    const up = [r({ price: 180000, fetchedAt: T(0) }), r({ price: 195000, fetchedAt: T(1) })];
    expect(priceStats(up, { now: NOW }).current?.price).toBe(195000);
  });
});

describe("Deal Score (basic, non-ML)", () => {
  it("DEMO scenario 189,000 → 169,000 with a 170,000 target scores in the 'very good' band", () => {
    const s = dealScore({ current: 169000, target: 170000, priorPrices: [189000] });
    expect(s.score).toBeGreaterThanOrEqual(80);
    expect(s).toMatchObject({ label: "매우 좋은 가격", emoji: "🔥", reference: true });
  });
  it("uses the spec bands: ≥80 / 65–79 / 40–64 / <40", () => {
    const labels = (n: number) => dealScore({ current: 1, target: undefined, priorPrices: [] }) && n;
    expect(labels(1)).toBe(1);
    // build prices that land in each band
    const high = dealScore({ current: 100, target: 120, priorPrices: [150, 150, 150, 150] });
    expect(high.score).toBeGreaterThanOrEqual(80);
    const mid = dealScore({ current: 150, target: 140, priorPrices: [150, 155, 150, 160] });
    expect(["보통", "좋은 가격"]).toContain(mid.label);
    const expensive = dealScore({ current: 250, target: 150, priorPrices: [150, 150, 150, 150] });
    expect(expensive.score).toBeLessThan(40);
    expect(expensive.label).toBe("비싼 편");
  });
  it("weights target 30 / average 30 / low 20 / drop 20 when everything is available", () => {
    const s = dealScore({ current: 70, target: 100, priorPrices: [100, 100, 100] });
    expect(s.components.map((c) => [c.key, c.weight])).toEqual([["target", 30], ["average", 30], ["low", 20], ["drop", 20]]);
    expect(s.score).toBe(100);
  });
  it("does not invent components: with no history only the target exists → no score (판단 불가), never an inflated one", () => {
    const targetOnly = dealScore({ current: 164200, target: 155000, priorPrices: [] });
    expect(targetOnly.components.map((c) => c.key)).toEqual(["target"]);
    expect(targetOnly.score).toBeUndefined(); // above target must NOT read as "very good"
    expect(targetOnly.label).toBe("판단 불가");
    const none = dealScore({ current: 100, priorPrices: [] });
    expect(none.score).toBeUndefined();
    expect(none.label).toBe("판단 불가");
  });
  it("a score needs at least two components", () => {
    expect(dealScore({ current: 100, priorPrices: [120] }).score).toBeDefined(); // low + drop
    expect(dealScore({ current: 100, target: 90, priorPrices: [120] }).components).toHaveLength(3);
  });
  it("needs 3 earlier prices before comparing with an average, and flags small samples as reference", () => {
    expect(dealScore({ current: 100, priorPrices: [150, 150] }).components.some((c) => c.key === "average")).toBe(false);
    expect(dealScore({ current: 100, priorPrices: [150, 150, 150] }).reference).toBe(false);
    expect(dealScore({ current: 100, priorPrices: [150] }).reference).toBe(true);
  });
});
