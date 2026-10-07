import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshWatchlists, restrictSources, runBackgroundScheduler, simulateDemoDrop, type RefreshDeps } from "@/features/watchlist/refresh";
import { MemoryWatchlistStore } from "@/features/watchlist/memory-store";
import type { NewWatchlist, ProviderCallLog } from "@/features/watchlist/types";
import { priceStats } from "@/features/price-history/stats";
import { NotificationService } from "@/lib/notifications/service";
import { TelegramNotificationProvider } from "@/lib/notifications/telegram";
import { SkyscannerProvider } from "@/providers/skyscanner";
import type { ProviderSchedulePolicy, SourceProvider } from "@/providers/types";
import { ProviderUnavailableError } from "@/providers/types";
import type { FlightOffer } from "@/types/domain";
import { demoOffers, fakeSource } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const USER = "00000000-0000-4000-8000-000000000001";
const NEW: NewWatchlist = {
  userId: USER, origin: "ICN", destination: "NRT", departureDate: "2026-11-12", returnDate: "2026-11-15", adults: 2, children: 0, cabinClass: "economy",
  directOnly: false, nearbyAirports: false, targetPrice: 170000, alertPriceDropPercent: 5, alertNewLow: true, notificationChannel: "telegram",
};
const BG_OK: ProviderSchedulePolicy = { userInitiatedSearch: true, backgroundPolling: true, minimumInterval: 3_600_000, policyStatus: "confirmed" };
const BG_NO: ProviderSchedulePolicy = { userInitiatedSearch: true, backgroundPolling: false, policyStatus: "confirmed" };

/** A one-fare offer list at the given per-person price. */
function priced(provider: string, price: number, demo = false): FlightOffer[] {
  const base = demoOffers(provider)[0]!;
  return [{ ...base, id: `${provider}-${price}`, provider, isDemo: demo, sourceType: demo ? "demo" : "api", pricePerPerson: price, totalPrice: price * 2 }];
}

class Clock {
  constructor(public t = Date.parse("2026-10-07T09:00:00Z")) {}
  now = () => new Date(this.t);
  advance(ms: number) { this.t += ms; }
}

function setup(sources: SourceProvider[], opts: { clock?: Clock; dryRun?: boolean } = {}) {
  const clock = opts.clock ?? new Clock();
  const store = new MemoryWatchlistStore(clock.now);
  const sent: { text: string; isDemo: boolean }[] = [];
  const notifier = new NotificationService([{ channel: "telegram", send: async (m) => (sent.push({ text: m.text, isDemo: m.isDemo }), { ok: true, dryRun: true }) }]);
  const deps = (trigger: "user" | "background", extra: Partial<RefreshDeps> = {}): RefreshDeps => ({ store, sources, notifier, trigger, timeoutMs: 1000, now: clock.now, userRefreshMinMs: 60_000, ...extra });
  return { clock, store, sent, deps };
}

describe("user refresh (trigger = user)", () => {
  it("calls the providers, stores price history, sets the registered price, and judges alerts", async () => {
    const price = { v: 189000 };
    const src = fakeSource("sky", { flight: async () => priced("sky", price.v), demo: false, flightPolicy: BG_NO });
    const { store, deps, clock, sent } = setup([src]);
    const w = await store.createWatchlist(NEW);

    const first = await refreshWatchlists([w], deps("user", { skipAlerts: true }));
    expect(first.outcomes[0]).toMatchObject({ status: "refreshed", current: { price: 189000 } });
    expect((await store.getWatchlist(w.id))?.registeredPrice).toBe(189000);
    expect(sent).toHaveLength(0); // creation never alerts

    clock.advance(10 * 60_000);
    price.v = 169000;
    const res = await refreshWatchlists([(await store.getWatchlist(w.id))!], deps("user"));
    const o = res.outcomes[0]!;
    expect(o).toMatchObject({ status: "refreshed", previous: 189000, current: { price: 169000 }, notified: true });
    expect(o.decisions.filter((d) => d.shouldNotify).map((d) => d.type).sort()).toEqual(["NEW_LOW", "PRICE_DROP", "TARGET_REACHED"]);
    expect(sent).toHaveLength(1); // ONE message even though three conditions were met
    expect(sent[0]!.text).toContain("✅ 목표가 도달");
    expect((await store.listPriceHistory(w.id)).map((r) => r.price)).toEqual([189000, 169000]);
    expect((await store.getWatchlist(w.id))?.lastUserRefreshAt).toBeDefined();
    expect((await store.listAlertHistory({ watchlistId: w.id })).map((h) => h.status)).toEqual(["dry_run", "dry_run", "dry_run"]);
  });

  it("an immediate second refresh is throttled (protects the API quota) and calls nothing", async () => {
    const fn = vi.fn(async () => priced("sky", 180000));
    const { store, deps, clock } = setup([fakeSource("sky", { flight: fn, demo: false })]);
    const w = await store.createWatchlist(NEW);
    await refreshWatchlists([w], deps("user"));
    const again = await refreshWatchlists([(await store.getWatchlist(w.id))!], deps("user"));
    expect(again.outcomes[0]).toMatchObject({ status: "throttled" });
    expect(again.outcomes[0]!.retryAfterSeconds).toBeGreaterThan(0);
    expect(fn).toHaveBeenCalledTimes(1);
    clock.advance(61_000);
    await refreshWatchlists([(await store.getWatchlist(w.id))!], deps("user"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls even background-forbidden providers (this is the ONLY way Live-only providers are called for a watchlist)", async () => {
    const live = vi.fn(async () => priced("sky", 175000));
    const { store, deps } = setup([fakeSource("sky", { flight: live, demo: false, flightPolicy: BG_NO })]);
    const w = await store.createWatchlist(NEW);
    await refreshWatchlists([w], deps("user"));
    expect(live).toHaveBeenCalledTimes(1);
  });

  it("works on a paused watchlist (pause only stops background runs)", async () => {
    const { store, deps } = setup([fakeSource("sky", { flight: async () => priced("sky", 175000), demo: false })]);
    const w = await store.createWatchlist({ ...NEW, enabled: false });
    expect((await refreshWatchlists([w], deps("user"))).outcomes[0]?.status).toBe("refreshed");
  });
});

describe("background scheduler respects provider policy (three barriers)", () => {
  it("NO provider allows background polling → zero provider calls, zero network calls, normal completion", async () => {
    const a = vi.fn(async () => priced("a", 1));
    const b = vi.fn(async () => priced("b", 1));
    const runSources = vi.fn();
    const { store, deps } = setup([fakeSource("a", { flight: a, flightPolicy: BG_NO }), fakeSource("b", { flight: b })]);
    for (let i = 0; i < 100; i++) await store.createWatchlist({ ...NEW, departureDate: `2026-11-${String(1 + (i % 28)).padStart(2, "0")}` });
    const report = await runBackgroundScheduler({ ...deps("background"), runSources });
    expect(report.watchlists).toBe(100);
    expect(report.networkCalls).toBe(0);
    expect(report.providerCalls).toEqual([]);
    expect(report.outcomes.every((o) => o.status === "no_provider")).toBe(true);
    expect(report.skippedProviders.map((s) => s.provider).sort()).toEqual(["a", "b"]);
    expect(runSources).not.toHaveBeenCalled();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(await store.listProviderCalls()).toEqual([]);
  });

  it("only the provider parts that allow it are called", async () => {
    const open = vi.fn(async () => priced("open", 180000));
    const closed = vi.fn(async () => priced("closed", 150000));
    const { store, deps } = setup([fakeSource("open", { flight: open, demo: false, flightPolicy: BG_OK }), fakeSource("closed", { flight: closed, demo: false, flightPolicy: BG_NO })]);
    const w = await store.createWatchlist(NEW);
    const report = await refreshWatchlists([w], deps("background"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(closed).not.toHaveBeenCalled();
    expect(report.providerCalls.map((c) => c.provider)).toEqual(["open"]);
    expect(report.skippedProviders.map((s) => s.provider)).toEqual(["closed"]);
    expect((await store.getWatchlist(w.id))?.lastBackgroundRefreshAt).toBeDefined();
    expect((await store.getWatchlist(w.id))?.lastUserRefreshAt).toBeUndefined();
    expect((await store.listPriceHistory(w.id)).every((r) => r.triggerType === "background")).toBe(true);
  });

  it("the REAL Skyscanner provider is never called by the scheduler (no network, even with an API key)", async () => {
    vi.stubEnv("SKYSCANNER_API_KEY", "KEY");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const sky: SourceProvider = { name: "skyscanner", displayName: "Skyscanner", role: "flight", checkUrl: "https://x", checkLabel: "x", directUrl: () => "https://x", flight: new SkyscannerProvider() };
    const { store, deps } = setup([sky]);
    await store.createWatchlist(NEW);
    const report = await runBackgroundScheduler(deps("background"));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report.networkCalls).toBe(0);
    expect(report.outcomes[0]?.status).toBe("no_provider");
  });

  it("even if the scheduler's plan were bypassed, the engine and the provider still refuse (defence in depth)", async () => {
    vi.stubEnv("SKYSCANNER_API_KEY", "KEY");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const sky: SourceProvider = { name: "skyscanner", displayName: "Skyscanner", role: "flight", checkUrl: "https://x", checkLabel: "x", directUrl: () => "https://x", flight: new SkyscannerProvider() };
    const { runSources } = await import("@/features/flight-search/engine");
    const { toSearchRequest } = await import("@/features/watchlist/search-key");
    const store = new MemoryWatchlistStore();
    const w = await store.createWatchlist(NEW);
    const results = await runSources(toSearchRequest(w), { sources: [sky], trigger: "background", timeoutMs: 100 }); // engine barrier
    expect(results[0]!.run.status).toBe("policy_skipped");
    const direct = await new SkyscannerProvider().searchFlights({ origin: "ICN", destination: "NRT", departureDate: "2026-11-12", adults: 1, children: 0, cabinClass: "economy", directOnly: false, currency: "KRW" }, { trigger: "background" }).catch((e) => e); // provider barrier
    expect(direct).toBeInstanceOf(ProviderUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a future approval (backgroundPolling = true, minimumInterval = 3,600,000 ms) is picked up with NO scheduler change", async () => {
    let policy: ProviderSchedulePolicy = { ...BG_NO };
    const calls = vi.fn(async () => priced("later", 180000));
    const src = fakeSource("later", { flight: calls, demo: false });
    src.flight!.schedulePolicy = () => policy;
    const { store, deps, clock } = setup([src]);
    const w = await store.createWatchlist(NEW);
    expect((await refreshWatchlists([w], deps("background"))).networkCalls).toBe(0);
    policy = { userInitiatedSearch: true, backgroundPolling: true, minimumInterval: 3_600_000, policyStatus: "confirmed" }; // approved later
    clock.advance(1000);
    expect((await refreshWatchlists([w], deps("background"))).networkCalls).toBe(1);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("minimum interval: data newer than the interval is reused, not re-requested", async () => {
    const fn = vi.fn(async () => priced("open", 180000));
    const { store, deps, clock } = setup([fakeSource("open", { flight: fn, demo: false, flightPolicy: BG_OK })]);
    const w = await store.createWatchlist(NEW);
    await refreshWatchlists([w], deps("background"));
    clock.advance(30 * 60_000);
    const early = await refreshWatchlists([w], deps("background"));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(early.networkCalls).toBe(0);
    expect(early.skippedProviders.some((s) => s.kind === "not_due")).toBe(true);
    expect(early.outcomes[0]?.status).toBe("no_provider");
    clock.advance(31 * 60_000);
    await refreshWatchlists([w], deps("background"));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a recent USER search also counts as fresh data for the interval", async () => {
    const fn = vi.fn(async () => priced("open", 180000));
    const { store, deps, clock } = setup([fakeSource("open", { flight: fn, demo: false, flightPolicy: BG_OK })]);
    const w = await store.createWatchlist(NEW);
    await refreshWatchlists([w], deps("user"));
    clock.advance(5 * 60_000);
    expect((await refreshWatchlists([w], deps("background"))).networkCalls).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("paused watchlists are skipped", async () => {
    const fn = vi.fn(async () => priced("open", 180000));
    const { store, deps } = setup([fakeSource("open", { flight: fn, demo: false, flightPolicy: BG_OK })]);
    await store.createWatchlist({ ...NEW, enabled: false });
    const report = await runBackgroundScheduler(deps("background"));
    expect(report.outcomes[0]?.status).toBe("paused");
    expect(fn).not.toHaveBeenCalled();
  });

  it("restrictSources keeps only planned parts", () => {
    const s = fakeSource("m", { flight: async () => [], deal: async () => [], role: "flight" });
    expect(restrictSources([s], [{ provider: "m", part: "deal" }]).map((x) => [!!x.flight, !!x.deal])).toEqual([[false, true]]);
    expect(restrictSources([s], [])).toEqual([]);
  });
});

describe("search grouping (cost control)", () => {
  it("30 watchlists with the same search → ONE provider search, results shared by all", async () => {
    const fn = vi.fn(async () => priced("open", 180000));
    const { store, deps } = setup([fakeSource("open", { flight: fn, demo: false, flightPolicy: BG_OK })]);
    const ws = [];
    for (let i = 0; i < 30; i++) ws.push(await store.createWatchlist({ ...NEW, targetPrice: 100000 + i * 1000 }));
    const report = await refreshWatchlists(ws, deps("background"));
    expect(report.searchGroups).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(report.networkCalls).toBe(1);
    expect(report.outcomes).toHaveLength(30);
    for (const w of ws) expect((await store.listPriceHistory(w.id)).map((r) => r.price)).toEqual([180000]);
  });
  it("different searches are different groups", async () => {
    const fn = vi.fn(async () => priced("open", 180000));
    const { store, deps } = setup([fakeSource("open", { flight: fn, demo: false, flightPolicy: BG_OK })]);
    const a = await store.createWatchlist(NEW);
    const b = await store.createWatchlist({ ...NEW, departureDate: "2026-11-13" });
    const c = await store.createWatchlist({ ...NEW, directOnly: true });
    const d = await store.createWatchlist({ ...NEW, adults: 1 });
    expect(new Set([a, b, c, d].map((w) => w.searchHash)).size).toBe(4);
    expect((await refreshWatchlists([a, b, c, d], deps("background"))).searchGroups).toBe(4);
    expect(fn).toHaveBeenCalledTimes(4);
  });
  it("the search hash ignores alert settings (same flight search ⇒ same group)", async () => {
    const store = new MemoryWatchlistStore();
    const a = await store.createWatchlist(NEW);
    const b = await store.createWatchlist({ ...NEW, targetPrice: 1234000, alertPriceDropPercent: 9, alertNewLow: false });
    expect(a.searchHash).toBe(b.searchHash);
  });
});

describe("provider failures", () => {
  it("one provider failing / timing out does not fail the job or the other providers", async () => {
    const { store, deps } = setup([
      fakeSource("good", { flight: async () => priced("good", 180000), demo: false, flightPolicy: BG_OK }),
      fakeSource("bad", { flight: async () => { throw new Error("HTTP 500"); }, flightPolicy: BG_OK }),
      fakeSource("slow", { flight: () => new Promise(() => {}), flightPolicy: BG_OK }),
    ]);
    const w = await store.createWatchlist(NEW);
    const report = await refreshWatchlists([w], deps("background", { timeoutMs: 50 }));
    expect(report.outcomes[0]).toMatchObject({ status: "refreshed", current: { price: 180000, provider: "good" } });
    const calls = await store.listProviderCalls();
    expect(Object.fromEntries(calls.map((c) => [c.provider, c.status]))).toEqual({ good: "ok", bad: "error", slow: "timeout" });
    expect(calls.find((c) => c.provider === "bad")).toMatchObject({ network: true, error: expect.any(String) });
  });
  it("a failing notifier does not break the refresh; failure is recorded and NOT counted as notified", async () => {
    const clock = new Clock();
    const store = new MemoryWatchlistStore(clock.now);
    const notifier = new NotificationService([{ channel: "telegram", send: async () => ({ ok: false, dryRun: false, error: "Telegram HTTP 500" }) }]);
    const w = await store.createWatchlist({ ...NEW, registeredPrice: 189000 });
    const src = fakeSource("sky", { flight: async () => priced("sky", 169000), demo: false });
    const res = await refreshWatchlists([w], { store, sources: [src], notifier, trigger: "user", timeoutMs: 1000, now: clock.now });
    expect(res.outcomes[0]).toMatchObject({ status: "refreshed", notified: false, errors: ["Telegram HTTP 500"] });
    expect((await store.listAlertHistory({ watchlistId: w.id })).every((h) => h.status === "failed")).toBe(true);
    expect((await store.getAlertState(w.id)).lastNotifiedPrice).toBeUndefined(); // will retry on the next evaluation
  });
  it("an error in one watchlist does not stop the others", async () => {
    const { store, deps } = setup([fakeSource("sky", { flight: async () => priced("sky", 180000), demo: false })]);
    const a = await store.createWatchlist(NEW);
    const b = await store.createWatchlist({ ...NEW, departureDate: "2026-12-01" });
    const spy = vi.spyOn(store, "listPriceHistory").mockImplementationOnce(async () => { throw new Error("db down"); });
    const report = await refreshWatchlists([a, b], deps("user"));
    spy.mockRestore();
    expect(report.outcomes.map((o) => o.status).sort()).toEqual(["error", "refreshed"]);
  });
});

describe("alert flow: duplicates, cooldown, direction", () => {
  async function scenario() {
    const price = { v: 189000 };
    const src = fakeSource("sky", { flight: async () => priced("sky", price.v), demo: false });
    const ctx = setup([src]);
    const w = await ctx.store.createWatchlist(NEW);
    const refresh = async () => (await refreshWatchlists([(await ctx.store.getWatchlist(w.id))!], ctx.deps("user", { userRefreshMinMs: 0 }))).outcomes[0]!;
    return { ...ctx, w, price, refresh };
  }

  it("the same price twice sends nothing the second time", async () => {
    const s = await scenario();
    await s.refresh(); // baseline 189,000 (no alert: not below the registered price)
    s.price.v = 169000;
    s.clock.advance(3_600_000);
    expect((await s.refresh()).notified).toBe(true);
    s.clock.advance(3_600_000);
    const same = await s.refresh();
    expect(same.notified).toBe(false);
    expect(s.sent).toHaveLength(1);
  });
  it("a price RISE never alerts, and an equal price never alerts", async () => {
    const s = await scenario();
    await s.refresh();
    s.price.v = 195000;
    s.clock.advance(3_600_000);
    expect((await s.refresh()).notified).toBe(false);
    s.clock.advance(3_600_000);
    expect((await s.refresh()).notified).toBe(false);
    expect(s.sent).toHaveLength(0);
  });
  it("a further drop inside the 6 h cooldown is suppressed; after the cooldown it is sent", async () => {
    const s = await scenario();
    await s.refresh();
    s.price.v = 169000;
    s.clock.advance(3_600_000);
    await s.refresh(); // 1st alert (target, drop, new low)
    s.price.v = 150000; // big further drop, 1 h later
    s.clock.advance(3_600_000);
    const within = await s.refresh();
    expect(within.notified).toBe(false);
    expect(within.decisions.filter((d) => d.suppressedBy === "cooldown").map((d) => d.type).sort()).toEqual(["NEW_LOW", "PRICE_DROP"]);
    s.price.v = 140000;
    s.clock.advance(6 * 3_600_000);
    const after = await s.refresh();
    expect(after.notified).toBe(true);
    expect(s.sent).toHaveLength(2);
  });
  it("target re-arms after the price goes back above it", async () => {
    const s = await scenario();
    await s.refresh();
    s.price.v = 169000;
    s.clock.advance(3_600_000);
    await s.refresh();
    s.price.v = 200000;
    s.clock.advance(3_600_000);
    await s.refresh();
    expect((await s.store.getAlertState(s.w.id)).targetActive).toBe(false);
    s.price.v = 165000;
    s.clock.advance(7 * 3_600_000);
    const o = await s.refresh();
    expect(o.decisions.find((d) => d.type === "TARGET_REACHED")?.shouldNotify).toBe(true);
  });
  it("alerts are not evaluated when a refresh brought no new fares (all providers failed)", async () => {
    const s = await scenario();
    await s.refresh();
    s.price.v = 169000;
    s.clock.advance(3_600_000);
    await s.refresh();
    const store = s.store;
    const broken = setup([fakeSource("sky", { flight: async () => { throw new Error("down"); } })], { clock: s.clock });
    const sent0 = s.sent.length;
    const o = (await refreshWatchlists([(await store.getWatchlist(s.w.id))!], { ...broken.deps("user", { userRefreshMinMs: 0 }), store, notifier: new NotificationService([{ channel: "telegram", send: async () => (s.sent.push({ text: "x", isDemo: false }), { ok: true, dryRun: true }) }]) })).outcomes[0]!;
    expect(o.decisions).toEqual([]);
    expect(s.sent.length).toBe(sent0);
  });
});

describe("DEMO and LIVE are never mixed", () => {
  it("demo-only data is flagged: stats, messages and history carry the DEMO marker", async () => {
    const { store, deps, sent } = setup([fakeSource("d", { flight: async () => priced("d", 169000, true) })]);
    const w = await store.createWatchlist({ ...NEW, registeredPrice: 189000, registeredIsDemo: true });
    const res = await refreshWatchlists([w], deps("user"));
    expect(res.outcomes[0]?.current).toMatchObject({ price: 169000, isDemo: true });
    expect(sent[0]?.isDemo).toBe(true);
    expect((await store.listAlertHistory({ watchlistId: w.id })).every((h) => h.isDemo)).toBe(true);
    expect((await store.listPriceHistory(w.id)).every((r) => r.sourceType === "demo")).toBe(true);
  });
  it("once real data arrives it replaces demo in every figure; a demo registration price is not compared with it", async () => {
    const clock = new Clock();
    const demoSrc = fakeSource("d", { flight: async () => priced("d", 100000, true) });
    const realSrc = fakeSource("r", { flight: async () => priced("r", 200000, false), demo: false });
    const { store, sent } = setup([demoSrc, realSrc], { clock });
    const w = await store.createWatchlist({ ...NEW, registeredPrice: 150000, registeredIsDemo: true, targetPrice: undefined });
    const notifier = new NotificationService([{ channel: "telegram", send: async (m) => (sent.push({ text: m.text, isDemo: m.isDemo }), { ok: true, dryRun: true }) }]);
    await refreshWatchlists([w], { store, sources: [demoSrc], notifier, trigger: "user", timeoutMs: 100, now: clock.now, userRefreshMinMs: 0 });
    clock.advance(3_600_000);
    const res = await refreshWatchlists([(await store.getWatchlist(w.id))!], { store, sources: [demoSrc, realSrc], notifier, trigger: "user", timeoutMs: 100, now: clock.now, userRefreshMinMs: 0 });
    expect(res.outcomes[0]?.current).toMatchObject({ price: 200000, isDemo: false });
    const stats = priceStats(await store.listPriceHistory(w.id), { now: clock.now(), registeredPrice: 150000, registeredIsDemo: true });
    expect(stats.mode).toBe("live");
    expect(stats.recentLow).toBe(200000); // the 100,000 demo price is not "the low"
    expect(stats.changeFromRegistered).toBeUndefined();
    expect(sent.filter((s) => !s.isDemo)).toHaveLength(0);
  });
});

describe("DEMO end-to-end: registered 189,000 → simulated drop → target 170,000 → Telegram (dry run)", () => {
  it("runs the real pipeline and sends exactly one dry-run Telegram message marked DEMO", async () => {
    const clock = new Clock();
    const store = new MemoryWatchlistStore(clock.now);
    const lines: string[] = [];
    const notifier = new NotificationService([new TelegramNotificationProvider({ dryRun: true, log: (l) => lines.push(l) })]);
    const src = fakeSource("demo-a", { flight: async () => priced("demo-a", 189000, true) });
    const w = await store.createWatchlist({ ...NEW, targetPrice: 170000, registeredPrice: undefined });
    await refreshWatchlists([w], { store, sources: [src], notifier, trigger: "user", timeoutMs: 100, now: clock.now, skipAlerts: true });
    expect((await store.getWatchlist(w.id))?.registeredPrice).toBe(189000);

    clock.advance(3_600_000);
    const out = await simulateDemoDrop((await store.getWatchlist(w.id))!, { store, notifier, sources: [src], now: clock.now, percent: 10.5 }); // 189,000 → 169,155 → rounded to 169,200 (≤ target 170,000)
    expect(out?.current).toMatchObject({ price: 169200, isDemo: true });
    expect(out?.notified).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[telegram:dry-run]");
    expect(lines[0]).toContain("DEMO DATA");
    expect(lines[0]).toContain("✅ 목표가 도달");
    expect(lines[0]).toMatch(/Deal Score\s+\d+\/100/);

    // running the simulation again right away must not duplicate the alert
    const again = await simulateDemoDrop((await store.getWatchlist(w.id))!, { store, notifier, sources: [src], now: clock.now, percent: 0.5 });
    expect(again?.notified).toBe(false);
    expect(lines).toHaveLength(1);
  });
  it("refuses to simulate on real (non-demo) data", async () => {
    const { store, deps, sent } = setup([fakeSource("sky", { flight: async () => priced("sky", 180000), demo: false })]);
    const w = await store.createWatchlist(NEW);
    await refreshWatchlists([w], deps("user"));
    expect(await simulateDemoDrop(w, { store, notifier: deps("user").notifier, sources: [], now: deps("user").now })).toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});

describe("related deals in watchlist alerts", () => {
  it("a similar-schedule deal triggers a RELATED_DEAL alert once", async () => {
    const dealSrc = fakeSource("chulguk", {
      deal: async () => [{ id: "gf1", provider: "chulguk", isDemo: false, title: "d", origin: "ICN", destination: "TYO", travelStartDate: "2026-11-11", travelEndDate: "2026-11-14", price: 139000, currency: "KRW", sourceType: "public_web", bookingUrl: "https://godflight.com/", publishedAt: "2026-10-07T00:00:00Z", rawSource: "t" }],
      dealPolicy: BG_OK,
      role: "deal",
    });
    const flightSrc = fakeSource("sky", { flight: async () => priced("sky", 178000), demo: false, flightPolicy: BG_OK });
    const { store, deps, clock, sent } = setup([flightSrc, dealSrc]);
    const w = await store.createWatchlist({ ...NEW, targetPrice: undefined, registeredPrice: 178000 });
    const r1 = await refreshWatchlists([w], deps("background"));
    expect(r1.outcomes[0]?.decisions.filter((d) => d.type === "RELATED_DEAL" && d.shouldNotify)).toHaveLength(1);
    expect(sent.some((m) => m.text.includes("비슷한 일정의 특가 발견") && m.text.includes("약 39,000원 절약"))).toBe(true);
    expect((await store.listPriceHistory(w.id)).filter((r) => r.triggerType === "deal")).toHaveLength(1);
    clock.advance(2 * 3_600_000);
    const r2 = await refreshWatchlists([w], deps("background"));
    expect(r2.outcomes[0]?.notified).toBe(false);
    expect(sent.filter((m) => m.text.includes("비슷한 일정의 특가")).length).toBe(1);
  });
});

describe("provider call log", () => {
  it("records parts, and counts only real network calls (demo, cache hits and manual refusals are not network)", async () => {
    const { store, deps } = setup([
      fakeSource("real", { flight: async () => priced("real", 180000), demo: false }),
      fakeSource("demo", { flight: async () => priced("demo", 170000, true) }),
      fakeSource("manual", { flight: async () => { throw new ProviderUnavailableError("manual", "manual_check", "m"); } }),
    ]);
    const w = await store.createWatchlist(NEW);
    const report = await refreshWatchlists([w], deps("user"));
    const by = Object.fromEntries((await store.listProviderCalls()).map((c: ProviderCallLog) => [c.provider, c]));
    expect(by.real).toMatchObject({ network: true, status: "ok", part: "flight", triggerType: "user", searchHash: w.searchHash });
    expect(by.demo?.network).toBe(false);
    expect(by.manual).toMatchObject({ network: false, status: "manual_check" });
    expect(by.manual?.error).toBeUndefined(); // a refusal to auto-check is a state, not an error
    expect(report.networkCalls).toBe(1);
  });
});
