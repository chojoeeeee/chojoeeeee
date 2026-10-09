import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relatedDeals, savingsTip } from "@/features/deal-engine/related";
import { runSearch } from "@/features/flight-search/engine";
import { CatchfrogDealProvider, catchfrog } from "@/providers/catchfrog";
import { catchfrogToTravelDeal, parseCatchfrogRaw } from "@/providers/catchfrog/mapper";
import { GodFlightDealProvider, chulguk } from "@/providers/chulguk";
import { godflightToTravelDeals, inferDate, inferEndDate, parseDuration } from "@/providers/chulguk/mapper";
import { clearPublicFetchCache } from "@/providers/public-web";
import { ProviderUnavailableError, StructureUnverifiedError } from "@/providers/types";
import { parseDiscountFraction, parseKrw } from "@/lib/parse";
import { dealQuery, request } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});
beforeEach(() => clearPublicFetchCache());
afterEach(() => vi.unstubAllEnvs());

const NOW = "2026-10-07T00:00:00Z";

describe("parse helpers", () => {
  it("parses KRW and discount percentages", () => {
    expect(parseKrw("257,900원")).toBe(257900);
    expect(parseKrw("₩149,000")).toBe(149000);
    expect(parseKrw("무료")).toBeUndefined();
    expect(parseDiscountFraction("-45.0%")).toBe(0.45);
    expect(parseDiscountFraction("44.7%")).toBe(0.447);
    expect(parseDiscountFraction("0%")).toBeUndefined();
    expect(parseDiscountFraction("150%")).toBeUndefined();
  });
});

describe("Catchfrog deal mapping (route + price + discount vs average)", () => {
  const raw = [
    { origin: "인천", destination: "세부", price: "257,900원", discountPercent: "-45.0%" },
    { origin: "인천", destination: "후쿠오카", price: "165,300원", averagePrice: "299,000원", discountPercent: "-44.7%" },
    { origin: "인천", destination: "", price: "100,000원" },
    { origin: "인천", destination: "도쿄", price: "가격 미정" },
  ];
  const deals = parseCatchfrogRaw(raw, NOW, "https://catchfrog.ai/");

  it("drops records without a destination or a parseable price", () => {
    expect(deals.map((d) => d.destination)).toEqual(["세부", "후쿠오카"]);
  });
  it("derives the average price only when the page does not give one", () => {
    expect(deals[0]).toMatchObject({ price: 257900, discountPercent: 0.45, averagePrice: Math.round(257900 / 0.55) });
    expect(deals[1]).toMatchObject({ averagePrice: 299000, discountPercent: 0.447 });
  });
  it("maps to a TravelDeal marked public_web, never demo, resolving the route", () => {
    const t = catchfrogToTravelDeal(deals[1]!);
    expect(t).toMatchObject({ provider: "catchfrog", sourceType: "public_web", isDemo: false, origin: "ICN", destination: "FUK", price: 165300, originalPrice: 299000, discountRate: 0.447, currency: "KRW" });
    expect(t.travelStartDate).toBeUndefined(); // the public list gives no travel dates
  });
});

describe("GodFlight deal mapping (departing-soon list)", () => {
  it("parses dates (year inference), duration and weekday", () => {
    expect(inferDate("11/11", "2026-10-07")).toBe("2026-11-11");
    expect(inferDate("2026-11-11", "2026-10-07")).toBe("2026-11-11");
    expect(inferDate("11.11", "2026-10-07")).toBe("2026-11-11");
    expect(inferDate("1/2", "2026-12-30")).toBe("2027-01-02"); // year rollover
    expect(inferDate("13/40", "2026-10-07")).toBeUndefined();
    expect(parseDuration("3박4일")).toEqual({ nights: 3, days: 4 });
    // end dates: same year, short rollover across New Year, and never "fixed" into next year
    expect(inferEndDate("11/14", "2026-11-11")).toBe("2026-11-14");
    expect(inferEndDate("1/2", "2026-12-30")).toBe("2027-01-02");
    expect(inferEndDate("11/09", "2026-11-11")).toBeUndefined();
    expect(inferEndDate("2026-12-30", "2026-11-11")).toBe("2026-12-30"); // 49 days: still a plausible trip
  });
  it("(sanity) trips longer than 60 days are rejected", () => {
    expect(inferEndDate("2027-02-01", "2026-11-11")).toBeUndefined();
  });

  const row = { origin: "인천", destination: "도쿄", price: "149,000원", dDay: "D-35", departureDate: "11/11", arrivalDate: "11/14", weekday: "수", duration: "3박4일" };
  it("maps a complete row to a TravelDeal", () => {
    const [d] = godflightToTravelDeals([row], NOW, "https://godflight.com/", "2026-10-07");
    expect(d).toMatchObject({ provider: "chulguk", sourceType: "public_web", isDemo: false, origin: "ICN", destination: "TYO", travelStartDate: "2026-11-11", travelEndDate: "2026-11-14", price: 149000, currency: "KRW" });
    expect(d?.title).toContain("D-35");
  });
  it("derives the end date from the duration when the end column is missing", () => {
    const [d] = godflightToTravelDeals([{ ...row, arrivalDate: undefined }], NOW, "x", "2026-10-07");
    expect(d?.travelEndDate).toBe("2026-11-14");
  });
  it("drops misparsed rows instead of repairing them (wrong weekday, end before start, missing fields)", () => {
    const bad = [
      { ...row, weekday: "월" }, // 2026-11-11 is a Wednesday
      { ...row, arrivalDate: "11/09", duration: undefined },
      { ...row, price: undefined },
      { ...row, origin: undefined },
      { ...row, departureDate: undefined },
    ];
    expect(godflightToTravelDeals(bad, NOW, "x", "2026-10-07")).toEqual([]);
  });
});

describe("matching public deals against the user's search (ICN→Tokyo, 11/12~11/15)", () => {
  const godflightDeal = godflightToTravelDeals([{ origin: "인천", destination: "도쿄", price: "139,000원", departureDate: "11/11", arrivalDate: "11/14", weekday: "수" }], NOW, "https://godflight.com/", "2026-10-07")[0]!;

  it("a similar-schedule deal (one day earlier, same length) is 'near_dates', not a flight ranking entry", () => {
    const [r] = relatedDeals([godflightDeal], request);
    expect(r).toMatchObject({ match: "near_dates", shiftDays: -1 });
  });
  it("produces the 'move one day earlier and save ~39,000원' tip against a 178,000원 flight", () => {
    const tip = savingsTip(relatedDeals([godflightDeal], request), 178000);
    expect(tip).toMatchObject({ shiftDays: -1, savingPerPerson: 39000 });
  });
  it("requires the same origin and destination", () => {
    expect(relatedDeals([{ ...godflightDeal, origin: "PUS" }], request)).toEqual([]);
    expect(relatedDeals([{ ...godflightDeal, destination: "BKK" }], request)).toEqual([]);
    expect(relatedDeals([{ ...godflightDeal, origin: "GMP" }], request)).toHaveLength(1); // same metro (Seoul)
  });
  it("requires a similar trip length (±1 day) and dates within ±3 days", () => {
    expect(relatedDeals([{ ...godflightDeal, travelStartDate: "2026-11-13", travelEndDate: "2026-11-22" }], request)).toEqual([]); // 9-day trip vs 3
    expect(relatedDeals([{ ...godflightDeal, travelStartDate: "2026-11-11", travelEndDate: "2026-11-20" }], request)[0]?.match).toBe("window"); // wide range that contains the search
    expect(relatedDeals([{ ...godflightDeal, travelStartDate: "2026-11-20", travelEndDate: "2026-11-23" }], request)).toEqual([]); // 8 days away
    expect(relatedDeals([{ ...godflightDeal, travelEndDate: "2026-11-15" }], request)).toHaveLength(1); // 4 vs 3 days
  });
  it("a route-only deal (Catchfrog list, no dates) is related by route", () => {
    const cf = catchfrogToTravelDeal({ destination: "도쿄", price: 149000, departureOrigin: "인천", discoveredAt: NOW, sourceUrl: "https://catchfrog.ai/" });
    expect(relatedDeals([cf], request)[0]?.match).toBe("destination_only");
    expect(savingsTip(relatedDeals([cf], request), 300000)).toBeUndefined(); // no dates → no "shift" tip
  });
});

describe("providers stay OFF until the owner approves collection", () => {
  it("Catchfrog: blocked by default (policy false/false), never touches the network", async () => {
    vi.stubEnv("CATCHFROG_COLLECTION_APPROVED", "");
    vi.stubEnv("DEMO_MODE", "");
    const fetchSpy = vi.fn();
    const p = new CatchfrogDealProvider(() => [], fetchSpy as unknown as typeof fetch);
    expect(p.schedulePolicy()).toMatchObject({ userInitiatedSearch: false, backgroundPolling: false, policyStatus: "unverified" });
    const err = await p.getDeals(dealQuery()).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(err.status).toBe("manual_check");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("GodFlight: blocked by default and never touches the network", async () => {
    vi.stubEnv("GODFLIGHT_COLLECTION_APPROVED", "");
    vi.stubEnv("DEMO_MODE", "");
    const fetchSpy = vi.fn();
    const p = new GodFlightDealProvider(() => [], fetchSpy as unknown as typeof fetch);
    expect(p.schedulePolicy()).toMatchObject({ userInitiatedSearch: false, backgroundPolling: false });
    await expect(p.getDeals(dealQuery())).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("Catchfrog: approval enables user searches, but background needs its own approval", () => {
    vi.stubEnv("CATCHFROG_COLLECTION_APPROVED", "yes");
    const p = new CatchfrogDealProvider();
    expect(p.schedulePolicy()).toMatchObject({ userInitiatedSearch: true, backgroundPolling: false });
    vi.stubEnv("CATCHFROG_BACKGROUND_APPROVED", "yes");
    expect(p.schedulePolicy().backgroundPolling).toBe(true);
    vi.stubEnv("CATCHFROG_COLLECTION_APPROVED", "");
    expect(p.schedulePolicy().backgroundPolling).toBe(false); // background without base approval is meaningless
  });

  const site = (html: string) =>
    vi.fn(async (url: string | URL | Request) => new Response(String(url).endsWith("robots.txt") ? "User-agent: *\nAllow: /" : html, { status: 200 })) as unknown as typeof fetch;

  it("once approved: fetches via the robots-aware fetcher and maps through the parser", async () => {
    vi.stubEnv("CATCHFROG_COLLECTION_APPROVED", "yes");
    const p = new CatchfrogDealProvider(() => [{ origin: "인천", destination: "후쿠오카", price: "165,300원", discountPercent: "-44.7%" }], site("<html/>"));
    const deals = await p.getDeals(dealQuery());
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ provider: "catchfrog", destination: "FUK", sourceType: "public_web" });
  });
  it("once approved but with the (default) unverified extractor: reports manual_check, not an error and not guessed data", async () => {
    vi.stubEnv("GODFLIGHT_COLLECTION_APPROVED", "yes");
    const p = new GodFlightDealProvider(undefined, site("<html/>"));
    await expect(p.getDeals(dealQuery())).rejects.toBeInstanceOf(StructureUnverifiedError);
    const res = await runSearch(request, { sources: [{ ...chulguk, deal: p }], timeoutMs: 1000 });
    expect(res.sources[0]).toMatchObject({ status: "manual_check", role: "deal" });
    expect(res.sources[0]?.reason).toContain("구조");
  });
  it("blocks background calls even when user searches are approved", async () => {
    vi.stubEnv("GODFLIGHT_COLLECTION_APPROVED", "yes");
    const p = new GodFlightDealProvider(() => [], site("<html/>"));
    await expect(p.getDeals(dealQuery(), { trigger: "background" })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("both are deal-only sources in the registry shape (no flight adapter)", () => {
    expect(catchfrog.flight).toBeUndefined();
    expect(chulguk.flight).toBeUndefined();
    expect(catchfrog.role).toBe("deal");
    expect(chulguk.role).toBe("deal");
  });
});
