import { describe, expect, it } from "vitest";
import { dealKeywords, describeShift, relatedDeals, savingsTip } from "@/features/deal-engine/related";
import { addDays, daysBetween, monthBounds } from "@/lib/dates";
import { deal, request } from "./helpers";

describe("related deals", () => {
  it("window deal that contains the requested dates", () => {
    const r = relatedDeals([deal({ travelStartDate: "2026-11-01", travelEndDate: "2026-11-30" })], request);
    expect(r[0]?.match).toBe("window");
  });
  it("exact deal one day earlier is near_dates with shift -1", () => {
    const r = relatedDeals([deal()], request);
    expect(r[0]).toMatchObject({ match: "near_dates", shiftDays: -1 });
  });
  it("same dates", () => {
    expect(relatedDeals([deal({ travelStartDate: "2026-11-12", travelEndDate: "2026-11-15" })], request)[0]?.match).toBe("same_dates");
  });
  it("ignores deals for other dates or other destinations", () => {
    expect(relatedDeals([deal({ travelStartDate: "2026-12-20", travelEndDate: "2026-12-23" })], request)).toEqual([]);
    expect(relatedDeals([deal({ destination: "BKK" })], request)).toEqual([]);
  });
  it("matches by city: a TYO deal matches an NRT/HND search; no dates → destination_only", () => {
    const r = relatedDeals([deal({ destination: "TYO", travelStartDate: undefined, travelEndDate: undefined })], request);
    expect(r[0]?.match).toBe("destination_only");
  });
  it("sorts cheapest first", () => {
    const r = relatedDeals([deal({ id: "a", price: 200000 }), deal({ id: "b", price: 100000 })], request);
    expect(r.map((x) => x.deal.id)).toEqual(["b", "a"]);
  });
});

describe("savings tip", () => {
  it("computes the saving vs the cheapest flight", () => {
    const tip = savingsTip(relatedDeals([deal()], request), 179000);
    expect(tip).toMatchObject({ shiftDays: -1, savingPerPerson: 50000 });
    expect(describeShift(tip!.shiftDays)).toBe("하루 앞당기면");
  });
  it("no tip when the deal is not cheaper, or no flight price, or non-KRW", () => {
    expect(savingsTip(relatedDeals([deal()], request), 100000)).toBeUndefined();
    expect(savingsTip(relatedDeals([deal()], request), undefined)).toBeUndefined();
    expect(savingsTip(relatedDeals([deal({ currency: "JPY" })], request), 500000)).toBeUndefined();
  });
  it("window deals never produce a shift tip", () => {
    expect(savingsTip(relatedDeals([deal({ travelStartDate: "2026-11-01", travelEndDate: "2026-11-30" })], request), 500000)).toBeUndefined();
  });
  it("describes later shifts", () => {
    expect(describeShift(2)).toBe("2일 미루면");
  });
});

describe("helpers", () => {
  it("date math", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(daysBetween("2026-11-12", "2026-11-15")).toBe(3);
    expect(monthBounds("2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("deal keywords include city, country, code and month", () => {
    const kw = dealKeywords(request);
    expect(kw).toEqual(expect.arrayContaining(["NRT", "도쿄", "일본", "11월"]));
  });
});
