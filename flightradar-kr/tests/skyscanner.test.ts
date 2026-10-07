import { describe, expect, it } from "vitest";
import { mapSkyscannerResponse, parsePrice } from "@/providers/skyscanner/mapper";
import type { SkySearchResponse } from "@/providers/skyscanner/types";
import { query } from "./helpers";

/** Hand-written fixture following the documented v3 shape — NOT a captured live response. */
const fixture: SkySearchResponse = {
  status: "RESULT_STATUS_COMPLETE",
  content: {
    results: {
      itineraries: {
        i1: {
          legIds: ["l1", "l2"],
          pricingOptions: [
            { price: { amount: "420000000", unit: "PRICE_UNIT_MILLI" }, items: [{ deepLink: "https://example.com/b" }] },
            { price: { amount: "380000000", unit: "PRICE_UNIT_MILLI" }, items: [{ deepLink: "https://example.com/a" }] },
          ],
        },
        broken: { legIds: ["missing"], pricingOptions: [] },
      },
      legs: {
        l1: { departureDateTime: { year: 2026, month: 11, day: 12, hour: 8, minute: 20 }, arrivalDateTime: { year: 2026, month: 11, day: 12, hour: 10, minute: 45 }, durationInMinutes: 145, stopCount: 0, marketingCarrierIds: ["c1"], segmentIds: ["s1"] },
        l2: { departureDateTime: { year: 2026, month: 11, day: 15, hour: 18, minute: 30 }, arrivalDateTime: { year: 2026, month: 11, day: 15, hour: 21, minute: 10 }, durationInMinutes: 160, stopCount: 0, marketingCarrierIds: ["c1"], segmentIds: ["s2"] },
      },
      segments: { s1: { marketingFlightNumber: "1102", marketingCarrierId: "c1" }, s2: { marketingFlightNumber: "1101", marketingCarrierId: "c1" } },
      carriers: { c1: { name: "제주항공", iataCode: "7C" } },
    },
  },
};

describe("skyscanner mapper", () => {
  it("parses milli prices and refuses unknown units", () => {
    expect(parsePrice({ amount: "189400000", unit: "PRICE_UNIT_MILLI" })).toBe(189400);
    expect(parsePrice({ amount: "100", unit: "PRICE_UNIT_WEIRD" })).toBeUndefined();
    expect(parsePrice({})).toBeUndefined();
  });
  it("maps the cheapest pricing option, per-person, with offsets", () => {
    const offers = mapSkyscannerResponse(fixture, query, "2026-10-07T00:00:00Z");
    expect(offers).toHaveLength(1); // the broken itinerary is skipped, not invented
    const o = offers[0]!;
    expect(o).toMatchObject({ provider: "skyscanner", isDemo: false, totalPrice: 380000, pricePerPerson: 190000, outboundFlightNumber: "7C1102", bookingUrl: "https://example.com/a" });
    expect(o.departureAt).toBe("2026-11-12T08:20:00+09:00");
    expect(o.totalDurationMinutes).toBe(305);
  });
  it("returns [] for an empty or unexpected payload", () => {
    expect(mapSkyscannerResponse({}, query, "x")).toEqual([]);
  });
});
