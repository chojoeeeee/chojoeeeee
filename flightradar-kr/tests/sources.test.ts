import { afterEach, describe, expect, it, vi } from "vitest";
import { runSearch } from "@/features/flight-search/engine";
import { getSources } from "@/providers/sources";
import { request } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});
afterEach(() => vi.unstubAllEnvs());

const names = ["skyscanner", "trip", "ali-flight", "catchfrog", "chulguk", "playwings"];

describe("the six required sources", () => {
  it("are all registered, with the right role on the result screen", () => {
    expect(getSources().map((s) => s.name)).toEqual(names);
    const roles = Object.fromEntries(getSources().map((s) => [s.name, s.role]));
    expect(roles).toEqual({ catchfrog: "deal", skyscanner: "flight", playwings: "deal", chulguk: "deal", "ali-flight": "flight", trip: "flight" });
    // deal services have no flight-search adapter, so they can never enter the price ranking
    for (const n of ["catchfrog", "playwings", "chulguk"]) expect(getSources().find((s) => s.name === n)?.flight).toBeUndefined();
  });

  it("are all attempted and shown without any keys or DEMO_MODE (nothing is invented)", async () => {
    vi.stubEnv("DEMO_MODE", "");
    vi.stubEnv("SKYSCANNER_API_KEY", "");
    const res = await runSearch(request, { sources: getSources(), timeoutMs: 1000 });
    expect(res.sources.map((s) => s.provider)).toEqual(names);
    const st = Object.fromEntries(res.sources.map((s) => [s.provider, s.status]));
    expect(st).toEqual({
      catchfrog: "manual_check",
      skyscanner: "api_required",
      playwings: "manual_check",
      chulguk: "manual_check",
      "ali-flight": "manual_check",
      trip: "partner_required",
    });
    expect(res.groups).toEqual([]);
    expect(res.dataMode).toBe("none"); // no demo banner when there is nothing to show
    expect(res.summary).toEqual({ total: 6, confirmed: 0, live: 0 });
    for (const s of res.sources) expect(s.reason).toBeTruthy();
  });

  it("DEMO_MODE exercises every UI state, all flagged as demo", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("SKYSCANNER_API_KEY", "");
    const res = await runSearch(request, { sources: getSources(), timeoutMs: 1000 });
    const st = Object.fromEntries(res.sources.map((s) => [s.provider, s.status]));
    expect(st).toEqual({ catchfrog: "deals_only", skyscanner: "ok", playwings: "manual_check", chulguk: "deals_only", "ali-flight": "ok", trip: "ok" });
    expect(res.dataMode).toBe("demo");
    expect(res.summary).toEqual({ total: 6, confirmed: 5, live: 0 });
    expect(res.groups.every((g) => g.offers.every((o) => o.isDemo && o.sourceType === "demo"))).toBe(true);
    expect(res.relatedDeals.length).toBeGreaterThan(0);
    expect(res.relatedDeals.every((r) => r.deal.isDemo)).toBe(true);
  });

  it("DEMO_MODE yields a date-shift saving tip based on the near-date deal", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = await runSearch(request, { sources: getSources(), timeoutMs: 1000 });
    expect(res.savingsTip).toBeDefined();
    expect(res.savingsTip!.shiftDays).toBe(-1);
    expect(res.savingsTip!.savingPerPerson).toBe(res.providerPrices[0]!.offer.pricePerPerson - res.savingsTip!.deal.price);
  });
});
