import { describe, expect, it, vi } from "vitest";
import { buildCreateBody, searchLive } from "@/providers/skyscanner/client";
import { mapSkyscannerResponse, parsePrice } from "@/providers/skyscanner/mapper";
import type { SkySearchResponse } from "@/providers/skyscanner/types";
import { ProviderUnavailableError } from "@/providers/types";
import complete from "./fixtures/skyscanner-live-response.json";
import partial from "./fixtures/skyscanner-create-incomplete.json";
import notModified from "./fixtures/skyscanner-poll-not-modified.json";
import { query } from "./helpers";

const full = complete as unknown as SkySearchResponse;
const NOW = "2026-10-07T00:00:00Z";

describe("skyscanner mapper (fixture)", () => {
  it("parses milli prices and refuses unknown units", () => {
    expect(parsePrice({ amount: "189400000", unit: "PRICE_UNIT_MILLI" })).toBe(189400);
    expect(parsePrice({ amount: "100", unit: "PRICE_UNIT_WEIRD" })).toBeUndefined();
    expect(parsePrice({})).toBeUndefined();
  });

  it("maps every priced itinerary and skips the unpriced one", () => {
    const offers = mapSkyscannerResponse(full, query, NOW);
    expect(offers.map((o) => o.id).sort()).toEqual(["skyscanner:i_direct_7c", "skyscanner:i_direct_ke", "skyscanner:i_stop_tw"]);
  });

  it("uses the cheapest pricing option and its agent as the seller", () => {
    const o = mapSkyscannerResponse(full, query, NOW).find((x) => x.id === "skyscanner:i_direct_7c")!;
    expect(o.totalPrice).toBe(378000); // not the 420,000 airline-direct option
    expect(o.pricePerPerson).toBe(189000); // 2 adults
    expect(o.seller).toBe("Trip.com");
    expect(o.bookingUrl).toBe("https://example.com/deeplink/trip-7c");
    expect(o).toMatchObject({ provider: "skyscanner", sourceType: "api", isDemo: false, currency: "KRW", priceType: "search", adults: 2 });
  });

  it("maps airline, airports, times, return leg, stops and duration", () => {
    const o = mapSkyscannerResponse(full, query, NOW).find((x) => x.id === "skyscanner:i_direct_7c")!;
    expect(o).toMatchObject({
      airline: "제주항공",
      originAirport: "ICN",
      destinationAirport: "NRT",
      departureAt: "2026-11-12T08:20:00+09:00",
      arrivalAt: "2026-11-12T10:45:00+09:00",
      returnDepartureAt: "2026-11-15T18:30:00+09:00",
      returnArrivalAt: "2026-11-15T21:10:00+09:00",
      outboundFlightNumber: "7C1102",
      inboundFlightNumber: "7C1101",
      stops: 0,
      totalDurationMinutes: 305,
      fetchedAt: NOW,
    });
  });

  it("takes airports from the response places (ICN→HND), not from the query", () => {
    const o = mapSkyscannerResponse(full, query, NOW).find((x) => x.id === "skyscanner:i_direct_ke")!;
    expect(o.destinationAirport).toBe("HND");
  });

  it("joins mashup agents and counts connecting flights", () => {
    const o = mapSkyscannerResponse(full, query, NOW).find((x) => x.id === "skyscanner:i_stop_tw")!;
    expect(o.seller).toBe("Trip.com + Jeju Air");
    expect(o.stops).toBe(1);
    expect(o.airline).toBe("티웨이항공 / 제주항공");
  });

  it("honours directOnly and one-way", () => {
    expect(mapSkyscannerResponse(full, { ...query, directOnly: true }, NOW).every((o) => o.stops === 0)).toBe(true);
    const oneWay = mapSkyscannerResponse(full, { ...query, returnDate: undefined }, NOW);
    expect(oneWay.length).toBeGreaterThan(0);
  });

  it("returns [] for empty / unexpected payloads and never throws", () => {
    expect(mapSkyscannerResponse({}, query, NOW)).toEqual([]);
    expect(mapSkyscannerResponse({ content: { results: { itineraries: { x: {} }, legs: {} } } }, query, NOW)).toEqual([]);
  });
});

function fakeFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}
const cfg = { apiKey: "KEY", market: "KR", locale: "ko-KR", sleep: async () => {} };

describe("skyscanner create + poll", () => {
  it("builds the create request body from the query", () => {
    const b = buildCreateBody(cfg, { ...query, returnDate: "2026-11-15" });
    expect(b.query).toMatchObject({ market: "KR", locale: "ko-KR", currency: "KRW", adults: 2, cabinClass: "CABIN_CLASS_ECONOMY" });
    expect(b.query.queryLegs).toEqual([
      { originPlaceId: { iata: "ICN" }, destinationPlaceId: { iata: "NRT" }, date: { year: 2026, month: 11, day: 12 } },
      { originPlaceId: { iata: "NRT" }, destinationPlaceId: { iata: "ICN" }, date: { year: 2026, month: 11, day: 15 } },
    ]);
  });

  it("creates, then polls until complete, using the session token and API key header", async () => {
    const f = fakeFetch([{ body: partial }, { body: complete }]);
    const res = await searchLive({ ...cfg, fetchImpl: f.impl }, query);
    expect(f.calls[0]!.url).toBe("https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/create");
    expect(f.calls[1]!.url).toBe("https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/poll/tok-123");
    expect((f.calls[0]!.init.headers as Record<string, string>)["x-api-key"]).toBe("KEY");
    expect(res.status).toBe("RESULT_STATUS_COMPLETE");
    expect(Object.keys(res.content?.results?.itineraries ?? {})).toHaveLength(4);
  });

  it("keeps earlier results when a poll says NOT_MODIFIED", async () => {
    const f = fakeFetch([{ body: partial }, { body: notModified }, { body: complete }]);
    const res = await searchLive({ ...cfg, fetchImpl: f.impl }, query);
    expect(f.calls).toHaveLength(3);
    expect(res.status).toBe("RESULT_STATUS_COMPLETE");
  });

  it("stops polling after maxPolls and returns the partial results", async () => {
    const f = fakeFetch([{ body: partial }]); // always incomplete
    const res = await searchLive({ ...cfg, maxPolls: 2, fetchImpl: f.impl }, query);
    expect(f.calls).toHaveLength(3); // create + 2 polls
    expect(Object.keys(res.content?.results?.itineraries ?? {})).toEqual(["i_direct_ke"]);
  });

  it("does not poll when create is already complete", async () => {
    const f = fakeFetch([{ body: complete }]);
    await searchLive({ ...cfg, fetchImpl: f.impl }, query);
    expect(f.calls).toHaveLength(1);
  });

  it("maps 401/403 to api_required, 429/5xx to ordinary errors, without leaking the key", async () => {
    for (const status of [401, 403]) {
      const f = fakeFetch([{ status }]);
      const err = await searchLive({ ...cfg, fetchImpl: f.impl }, query).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect((err as ProviderUnavailableError).status).toBe("api_required");
      expect(String(err.message)).not.toContain("KEY");
    }
    for (const status of [429, 500]) {
      const f = fakeFetch([{ status }]);
      const err = await searchLive({ ...cfg, fetchImpl: f.impl }, query).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(ProviderUnavailableError);
      expect(String(err.message)).toContain(String(status));
    }
  });

  it("fails on RESULT_STATUS_FAILED", async () => {
    const f = fakeFetch([{ body: { status: "RESULT_STATUS_FAILED" } }]);
    await expect(searchLive({ ...cfg, fetchImpl: f.impl }, query)).rejects.toThrow(/failed/);
  });
});
