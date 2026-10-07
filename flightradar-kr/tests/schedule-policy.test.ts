import { afterEach, describe, expect, it, vi } from "vitest";
import { alertModeFor, planBackgroundRefresh } from "@/features/alerts/background-plan";
import { policyViolation, runSearch } from "@/features/flight-search/engine";
import { SkyscannerProvider } from "@/providers/skyscanner";
import { SKYSCANNER_INDICATIVE_POLICY, SKYSCANNER_LIVE_POLICY, SKYSCANNER_REFRESH_POLICY } from "@/providers/skyscanner/policy";
import { getSources } from "@/providers/sources";
import { DEFAULT_SCHEDULE_POLICY, ProviderUnavailableError, type ProviderSchedulePolicy } from "@/providers/types";
import { demoOffers, deal, fakeSource, query, request } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ALLOWED: ProviderSchedulePolicy = { userInitiatedSearch: true, backgroundPolling: true, minimumInterval: 60, policyStatus: "confirmed" };
const FORBIDDEN: ProviderSchedulePolicy = { userInitiatedSearch: true, backgroundPolling: false, policyStatus: "confirmed", notes: "no cron" };

describe("Skyscanner policies (Usage Guidelines)", () => {
  it("Live Prices: user search yes, background no — confirmed by the published guidelines", () => {
    expect(SKYSCANNER_LIVE_POLICY).toMatchObject({ userInitiatedSearch: true, backgroundPolling: false, policyStatus: "confirmed" });
  });
  it("Indicative and Refresh stay background=false and 'unverified' until the partner contract says otherwise", () => {
    for (const p of [SKYSCANNER_INDICATIVE_POLICY, SKYSCANNER_REFRESH_POLICY]) {
      expect(p).toMatchObject({ userInitiatedSearch: true, backgroundPolling: false, policyStatus: "unverified" });
    }
  });
  it("the provider refuses a Live call marked as background, without any network access", async () => {
    vi.stubEnv("SKYSCANNER_API_KEY", "KEY");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const err = await new SkyscannerProvider().searchFlights(query, { trigger: "background" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("the provider exposes the Live policy", () => {
    expect(new SkyscannerProvider().schedulePolicy()).toBe(SKYSCANNER_LIVE_POLICY);
  });
});

describe("engine enforces provider policy by trigger", () => {
  it("user-initiated search calls every provider (default trigger)", async () => {
    const live = vi.fn(async () => demoOffers("live"));
    const res = await runSearch(request, { timeoutMs: 100, sources: [fakeSource("live", { flight: live, flightPolicy: FORBIDDEN })] });
    expect(live).toHaveBeenCalledTimes(1);
    expect(res.sources[0]?.status).toBe("ok");
  });

  it("background run skips providers that forbid it — the provider is never called", async () => {
    const live = vi.fn(async () => demoOffers("live"));
    const open = vi.fn(async () => demoOffers("open"));
    const res = await runSearch(request, {
      timeoutMs: 100,
      trigger: "background",
      sources: [fakeSource("live", { flight: live, flightPolicy: FORBIDDEN }), fakeSource("open", { flight: open, flightPolicy: ALLOWED })],
    });
    expect(live).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    const byName = Object.fromEntries(res.sources.map((s) => [s.provider, s]));
    expect(byName.live).toMatchObject({ status: "policy_skipped" });
    expect(byName.live?.reason).toContain("no cron");
    expect(byName.open?.status).toBe("ok");
  });

  it("a provider that declares no policy is treated restrictively (no background calls)", async () => {
    const fn = vi.fn(async () => demoOffers("x"));
    const res = await runSearch(request, { timeoutMs: 100, trigger: "background", sources: [fakeSource("x", { flight: fn })] });
    expect(fn).not.toHaveBeenCalled();
    expect(res.sources[0]?.status).toBe("policy_skipped");
    expect(policyViolation(undefined, "background")).toBeTruthy();
    expect(policyViolation(undefined, "user")).toBeUndefined();
  });

  it("flight and deal parts are judged separately within one source", async () => {
    const flight = vi.fn(async () => demoOffers("m"));
    const deals = vi.fn(async () => [deal({ isDemo: true })]);
    const res = await runSearch(request, {
      timeoutMs: 100,
      trigger: "background",
      sources: [fakeSource("m", { flight, deal: deals, role: "flight", flightPolicy: FORBIDDEN, dealPolicy: ALLOWED })],
    });
    expect(flight).not.toHaveBeenCalled();
    expect(deals).toHaveBeenCalledTimes(1);
    expect(res.sources[0]?.status).toBe("deals_only");
  });

  it("passes the trigger to the provider", async () => {
    let seen: string | undefined;
    await runSearch(request, { timeoutMs: 100, trigger: "background", sources: [fakeSource("o", { flight: async (_q, ctx) => { seen = ctx?.trigger; return demoOffers("o"); }, flightPolicy: ALLOWED })] });
    expect(seen).toBe("background");
  });

  it("a fully skipped background run is not counted as confirmed data", async () => {
    const res = await runSearch(request, { timeoutMs: 100, trigger: "background", sources: [fakeSource("a", { flight: async () => demoOffers("a"), flightPolicy: FORBIDDEN })] });
    expect(res.summary).toMatchObject({ confirmed: 0, live: 0 });
  });
});

describe("Watchlist planning (Phase 2 will use this; nothing is scheduled yet)", () => {
  it("with the real six sources and default settings NO background call is planned", () => {
    for (const k of ["CATCHFROG_COLLECTION_APPROVED", "GODFLIGHT_COLLECTION_APPROVED", "CATCHFROG_BACKGROUND_APPROVED", "GODFLIGHT_BACKGROUND_APPROVED", "ALI_PROVIDER_MODE"]) vi.stubEnv(k, "");
    const plan = planBackgroundRefresh(getSources(), { now: new Date("2026-10-07T00:00:00Z") });
    expect(plan.calls).toEqual([]);
    expect(plan.skipped.length).toBeGreaterThanOrEqual(6);
    expect(plan.skipped.every((s) => s.kind === "policy")).toBe(true);
    expect(new Set(plan.skipped.map((s) => s.provider))).toEqual(new Set(["catchfrog", "skyscanner", "playwings", "chulguk", "ali-flight", "trip"]));
    expect(Object.values(plan.alertModes).every((m) => m === "user_refresh")).toBe(true);
  });

  it("plans only providers whose policy allows polling, and respects the minimum interval", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const sources = [fakeSource("open", { flight: async () => [], flightPolicy: ALLOWED }), fakeSource("closed", { flight: async () => [], flightPolicy: FORBIDDEN })];
    expect(planBackgroundRefresh(sources, { now }).calls).toEqual([{ provider: "open", part: "flight" }]);

    const recent = planBackgroundRefresh(sources, { now, lastCalledAt: { "open:flight": "2026-10-07T11:30:00Z" } });
    expect(recent.calls).toEqual([]);
    expect(recent.skipped.find((s) => s.provider === "open")).toMatchObject({ kind: "not_due" });

    const due = planBackgroundRefresh(sources, { now, lastCalledAt: { "open:flight": "2026-10-07T10:30:00Z" } });
    expect(due.calls).toEqual([{ provider: "open", part: "flight" }]);
  });

  it("classifies alert modes: background vs user-refresh", () => {
    expect(alertModeFor(ALLOWED)).toBe("background");
    expect(alertModeFor(FORBIDDEN)).toBe("user_refresh");
    expect(alertModeFor(undefined)).toBe("user_refresh");
    expect(alertModeFor(DEFAULT_SCHEDULE_POLICY)).toBe("user_refresh");
  });

  it("the plan agrees with what the engine would actually do (two barriers, same rule)", async () => {
    const sources = [fakeSource("open", { flight: async () => demoOffers("open"), flightPolicy: ALLOWED }), fakeSource("closed", { flight: async () => demoOffers("closed"), flightPolicy: FORBIDDEN })];
    const plan = planBackgroundRefresh(sources, { now: new Date() });
    const res = await runSearch(request, { timeoutMs: 100, trigger: "background", sources });
    const ran = res.sources.filter((s) => s.status !== "policy_skipped").map((s) => s.provider);
    expect(ran).toEqual(plan.calls.map((c) => c.provider));
  });
});
