import { describe, expect, it } from "vitest";
import { groupOffers, providerPrices, recommend, sortGroups } from "@/features/flight-search/compare";
import { searchHash } from "@/features/flight-search/hash";
import { flightKey, normalizeOffers, toKrw } from "@/features/flight-search/normalize";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { generateDemoOffers } from "@/providers/mock/generator";
import { demoOffers, query, realOffer } from "./helpers";

describe("currency", () => {
  it("passes KRW through and converts with supplied rates", () => {
    expect(toKrw(1000, "KRW", {})).toBe(1000);
    expect(toKrw(100, "JPY", { JPY: 9.2 })).toBe(920);
  });
  it("refuses to convert without a rate (no guessing)", () => {
    expect(toKrw(100, "USD", {})).toBeUndefined();
    const { offers, dropped } = normalizeOffers([realOffer({ currency: "USD" })], {});
    expect(offers).toHaveLength(0);
    expect(dropped).toBe(1);
  });
  it("normalizes foreign-currency offers to KRW", () => {
    const { offers } = normalizeOffers([realOffer({ currency: "JPY", pricePerPerson: 20000, totalPrice: 40000 })], { JPY: 9 });
    expect(offers[0]).toMatchObject({ currency: "KRW", pricePerPerson: 180000, totalPrice: 360000 });
  });
});

describe("dedupe", () => {
  it("keeps the cheapest of duplicate flights from the same provider", () => {
    const a = realOffer({ id: "1", pricePerPerson: 200000, totalPrice: 400000 });
    const b = realOffer({ id: "2", pricePerPerson: 180000, totalPrice: 360000 });
    const { offers, dropped } = normalizeOffers([a, b]);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.id).toBe("2");
    expect(dropped).toBe(1);
  });
  it("keeps the same flight from different providers and groups them", () => {
    const a = realOffer({ id: "1", provider: "x" });
    const b = realOffer({ id: "2", provider: "y", pricePerPerson: a.pricePerPerson - 1000 });
    const { offers } = normalizeOffers([a, b]);
    expect(offers).toHaveLength(2);
    const groups = groupOffers(offers);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.best.provider).toBe("y");
  });
  it("drops insane offers (arrival before departure, zero price)", () => {
    const base = realOffer();
    const { offers } = normalizeOffers([
      { ...base, id: "a", arrivalAt: base.departureAt },
      { ...base, id: "b", pricePerPerson: 0 },
    ]);
    expect(offers).toHaveLength(0);
  });
});

describe("round trip / one way / time zones", () => {
  it("round trip has return legs with correct duration total", () => {
    const o = demoOffers("a").find((x) => x.stops === 0)!;
    expect(o.returnDepartureAt).toBeDefined();
    expect(o.totalDurationMinutes).toBe(290); // 145 * 2
    expect(o.arrivalAt).toContain("+09:00");
  });
  it("one way has no return fields", () => {
    const [o] = generateDemoOffers({ ...query, returnDate: undefined }, { provider: "a", bias: 1 });
    expect(o?.returnDepartureAt).toBeUndefined();
    expect(o?.inboundFlightNumber).toBeUndefined();
  });
  it("arrival is computed in the destination offset from the real elapsed time", () => {
    const o = demoOffers("a").find((x) => x.airline === "제주항공")!;
    expect((Date.parse(o.arrivalAt) - Date.parse(o.departureAt)) / 60000).toBe(145);
    expect(o.departureAt).toBe("2026-11-12T08:20:00+09:00");
    expect(o.arrivalAt).toBe("2026-11-12T10:45:00+09:00");
  });
  it("changing the date changes the offers' dates and key", () => {
    const [a] = generateDemoOffers(query, { provider: "a", bias: 1 });
    const [b] = generateDemoOffers({ ...query, departureDate: "2026-11-13", returnDate: "2026-11-16" }, { provider: "a", bias: 1 });
    expect(flightKey(a!)).not.toBe(flightKey(b!));
    expect(b?.departureAt.startsWith("2026-11-13")).toBe(true);
  });
  it("returns nothing (not made-up data) for airports with unknown time zones", () => {
    expect(generateDemoOffers({ ...query, destination: "ZZZ" }, { provider: "a", bias: 1 })).toEqual([]);
  });
});

describe("price comparison", () => {
  it("ranks providers by cheapest price", () => {
    const offers = [...demoOffers("a", 1), ...demoOffers("b", 1.1)];
    const ranked = providerPrices(offers);
    expect(ranked.map((r) => r.provider)).toEqual(["a", "b"]);
    expect(ranked[0]?.rank).toBe(1);
  });
  it("price changes are reflected: a cheaper provider becomes the best", () => {
    const base = demoOffers("a");
    const cheaper = base.map((o) => ({ ...o, provider: "b", id: `b${o.id}`, pricePerPerson: o.pricePerPerson - 5000, totalPrice: o.totalPrice - 10000 }));
    expect(groupOffers([...base, ...cheaper])[0]?.best.provider).toBe("b");
  });
  it("recommendations: cheapest is truly the minimum; comfortable prefers direct", () => {
    const groups = groupOffers(demoOffers("a"));
    const rec = recommend(groups);
    const min = Math.min(...groups.map((g) => g.best.pricePerPerson));
    expect(rec.cheapest?.best.pricePerPerson).toBe(min);
    expect(rec.comfortable?.best.stops).toBe(0);
  });
  it("sorts by price, departure and duration", () => {
    const groups = groupOffers(demoOffers("a"));
    const p = sortGroups(groups, "price").map((g) => g.best.pricePerPerson);
    expect(p).toEqual([...p].sort((x, y) => x - y));
    const d = sortGroups(groups, "departure").map((g) => Date.parse(g.best.departureAt));
    expect(d).toEqual([...d].sort((x, y) => x - y));
    const t = sortGroups(groups, "duration").map((g) => g.best.totalDurationMinutes);
    expect(t).toEqual([...t].sort((x, y) => x - y));
  });
  it("direct-only filter removes connecting flights", () => {
    const offers = generateDemoOffers({ ...query, directOnly: true }, { provider: "a", bias: 1 });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.stops === 0)).toBe(true);
  });
  it("is deterministic and total = per-person × travellers", () => {
    const a = demoOffers("a");
    expect(demoOffers("a").map((o) => o.pricePerPerson)).toEqual(a.map((o) => o.pricePerPerson));
    expect(a.every((o) => o.totalPrice === o.pricePerPerson * 2)).toBe(true);
  });
});

describe("search hash", () => {
  it("is stable for equal queries and differs when anything changes", () => {
    expect(searchHash(query)).toBe(searchHash({ ...query }));
    expect(searchHash(query)).not.toBe(searchHash({ ...query, adults: 3 }));
    expect(searchHash(query)).not.toBe(searchHash({ ...query, returnDate: undefined }));
    expect(searchHash(query, "a")).not.toBe(searchHash(query, "b"));
  });
});

describe("request validation", () => {
  it("accepts a valid query and expands nearby airports", () => {
    const p = parseSearchParams({ origin: "icn", destination: "nrt", departureDate: "2026-11-12", returnDate: "2026-11-15", adults: "2", nearby: "true" });
    expect(p.success).toBe(true);
    if (p.success) {
      const r = toRequest(p.data);
      expect(r.origins).toEqual(["ICN", "GMP"]);
      expect(r.destinations).toEqual(["NRT", "HND"]);
    }
  });
  it("treats directOnly=false as false", () => {
    const p = parseSearchParams({ origin: "ICN", destination: "NRT", departureDate: "2026-11-12", directOnly: "false" });
    expect(p.success && p.data.directOnly).toBe(false);
  });
  it("rejects return before departure, same airports, bad dates", () => {
    expect(parseSearchParams({ origin: "ICN", destination: "NRT", departureDate: "2026-11-12", returnDate: "2026-11-10" }).success).toBe(false);
    expect(parseSearchParams({ origin: "ICN", destination: "ICN", departureDate: "2026-11-12" }).success).toBe(false);
    expect(parseSearchParams({ origin: "ICN", destination: "NRT", departureDate: "2026-13-45" }).success).toBe(false);
  });
});
