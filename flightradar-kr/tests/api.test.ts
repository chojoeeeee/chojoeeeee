import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cronGET } from "@/app/api/cron/watchlists/route";
import { GET as listGET, POST as createPOST } from "@/app/api/watchlists/route";
import { DELETE, PATCH } from "@/app/api/watchlists/[id]/route";
import { POST as demoDropPOST } from "@/app/api/watchlists/[id]/demo-drop/route";
import { POST as refreshPOST } from "@/app/api/watchlists/[id]/refresh/route";
import { GET as settingsGET, POST as settingsPOST } from "@/app/api/settings/notifications/route";
import { POST as testPOST } from "@/app/api/settings/notifications/test/route";
import { getStore, isCronAuthorized, isSameOriginJson } from "@/features/watchlist/service";

vi.spyOn(console, "info").mockImplementation(() => {});

const g = globalThis as unknown as { __flightradarStore?: unknown };
beforeEach(() => {
  g.__flightradarStore = undefined; // fresh in-memory store
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("TELEGRAM_DRY_RUN", "true");
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("SKYSCANNER_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const json = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json", host: "localhost", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const body = { origin: "icn", destination: "nrt", departureDate: "2026-11-12", returnDate: "2026-11-15", adults: 2, cabinClass: "economy", directOnly: false, targetPrice: 170000, alertPriceDropPercent: 5, alertNewLowest: true, notificationChannel: "telegram", enabled: true };

async function create() {
  const res = await createPOST(json("/api/watchlists", "POST", body));
  return (await res.json()) as { watchlist: { id: string; registeredPrice?: number; registeredIsDemo: boolean; searchHash: string }; outcome: { status: string; current?: { price: number; isDemo: boolean } } };
}

describe("watchlist CRUD API", () => {
  it("creates a watchlist (spec fields), fetches first prices, and lists it", async () => {
    const res = await createPOST(json("/api/watchlists", "POST", body));
    expect(res.status).toBe(201);
    const { watchlist, outcome } = (await res.json()) as Awaited<ReturnType<typeof create>>;
    expect(watchlist).toMatchObject({ origin: "ICN", destination: "NRT", targetPrice: 170000, alertPriceDropPercent: 5, alertNewLow: true, notificationChannel: "telegram", enabled: true, adults: 2 });
    expect(outcome.status).toBe("refreshed");
    expect(watchlist.registeredPrice).toBeGreaterThan(0);
    expect(watchlist.registeredIsDemo).toBe(true); // DEMO_MODE data is flagged from the very first price
    const list = (await (await listGET()).json()) as { watchlists: { id: string }[] };
    expect(list.watchlists.map((w) => w.id)).toContain(watchlist.id);
  });
  it("validates input (bad IATA, same airports, return before departure, silly target)", async () => {
    for (const bad of [{ ...body, origin: "ICNN" }, { ...body, destination: "ICN" }, { ...body, returnDate: "2026-11-01" }, { ...body, targetPrice: 5 }, { ...body, adults: 0 }]) {
      expect((await createPOST(json("/api/watchlists", "POST", bad))).status).toBe(400);
    }
  });
  it("pauses and resumes, changes the target, clears the target", async () => {
    const { watchlist } = await create();
    const patch = async (b: unknown) => (await (await PATCH(json(`/api/watchlists/${watchlist.id}`, "PATCH", b), ctx(watchlist.id))).json()) as { watchlist: { enabled: boolean; targetPrice?: number } };
    expect((await patch({ enabled: false })).watchlist.enabled).toBe(false);
    expect((await patch({ enabled: true, targetPrice: 150000 })).watchlist).toMatchObject({ enabled: true, targetPrice: 150000 });
    expect((await patch({ targetPrice: null })).watchlist.targetPrice).toBeUndefined();
    expect((await PATCH(json(`/api/watchlists/${watchlist.id}`, "PATCH", { bogus: 1 }), ctx(watchlist.id))).status).toBe(400);
  });
  it("deletes a watchlist (and 404s afterwards)", async () => {
    const { watchlist } = await create();
    expect((await DELETE(json(`/api/watchlists/${watchlist.id}`, "DELETE"), ctx(watchlist.id))).status).toBe(200);
    expect(await getStore().getWatchlist(watchlist.id)).toBeUndefined();
    expect((await DELETE(json(`/api/watchlists/${watchlist.id}`, "DELETE"), ctx(watchlist.id))).status).toBe(404);
    expect((await refreshPOST(json(`/api/watchlists/${watchlist.id}/refresh`, "POST", {}), ctx(watchlist.id))).status).toBe(404);
  });
  it("rejects cross-origin and non-JSON mutations", async () => {
    expect((await createPOST(json("/api/watchlists", "POST", body, { origin: "https://evil.example" }))).status).toBe(400);
    expect((await createPOST(new Request("http://localhost/api/watchlists", { method: "POST", headers: { "content-type": "text/plain", host: "localhost" }, body: JSON.stringify(body) }))).status).toBe(400);
    expect(isSameOriginJson(json("/x", "POST", {}, { origin: "http://localhost" }))).toBe(true);
    expect(isSameOriginJson(json("/x", "POST", {}, { origin: "http://localhost.evil.com" }))).toBe(false);
  });
});

describe("user refresh (다시 확인)", () => {
  it("refreshes with trigger=user, is throttled when repeated, and reports network calls", async () => {
    const { watchlist } = await create();
    await getStore().updateWatchlist(watchlist.id, { lastUserRefreshAt: new Date(Date.now() - 3_600_000).toISOString() });
    const ok = (await (await refreshPOST(json(`/api/watchlists/${watchlist.id}/refresh`, "POST", {}), ctx(watchlist.id))).json()) as { outcome: { status: string }; networkCalls: number };
    expect(ok.outcome.status).toBe("refreshed");
    expect(ok.networkCalls).toBe(0); // DEMO data: no real network call
    const again = (await (await refreshPOST(json(`/api/watchlists/${watchlist.id}/refresh`, "POST", {}), ctx(watchlist.id))).json()) as { outcome: { status: string; retryAfterSeconds: number } };
    expect(again.outcome.status).toBe("throttled");
    expect((await getStore().listPriceHistory(watchlist.id)).some((r) => r.triggerType === "user")).toBe(true);
  });
});

describe("DEMO drop → alert (dry-run Telegram)", () => {
  it("simulates a price drop on DEMO data and sends a DEMO-marked dry-run alert once", async () => {
    const { watchlist } = await create();
    await getStore().updateWatchlist(watchlist.id, { targetPrice: 999999 }); // any DEMO price is below the target
    const res = await demoDropPOST(json(`/api/watchlists/${watchlist.id}/demo-drop`, "POST", {}), ctx(watchlist.id));
    expect(res.status).toBe(200);
    const { outcome } = (await res.json()) as { outcome: { notified: boolean; current: { isDemo: boolean } } };
    expect(outcome.current.isDemo).toBe(true);
    expect(outcome.notified).toBe(true);
    const hist = await getStore().listAlertHistory({ watchlistId: watchlist.id });
    expect(hist.length).toBeGreaterThan(0);
    expect(hist.every((h) => h.status === "dry_run" && h.isDemo)).toBe(true);
  });
  it("does not exist outside DEMO_MODE", async () => {
    const { watchlist } = await create();
    vi.stubEnv("DEMO_MODE", "false");
    expect((await demoDropPOST(json(`/api/watchlists/${watchlist.id}/demo-drop`, "POST", {}), ctx(watchlist.id))).status).toBe(404);
  });
});

describe("Cron endpoint", () => {
  it("is 401 without / with a wrong secret, and fails closed when no secret is configured", async () => {
    expect((await cronGET(new Request("http://localhost/api/cron/watchlists"))).status).toBe(401);
    expect((await cronGET(new Request("http://localhost/api/cron/watchlists", { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    expect((await cronGET(new Request("http://localhost/api/cron/watchlists", { headers: { authorization: "s3cret" } }))).status).toBe(401); // missing "Bearer "
    vi.stubEnv("CRON_SECRET", "");
    expect((await cronGET(new Request("http://localhost/api/cron/watchlists", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    expect(isCronAuthorized(null)).toBe(false);
  });
  it("with the secret: runs, makes ZERO network calls when no provider allows background polling, and finishes normally", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (let i = 0; i < 5; i++) await getStore().createWatchlist({ userId: "00000000-0000-4000-8000-000000000001", origin: "ICN", destination: "NRT", departureDate: `2026-11-1${i}`, returnDate: `2026-11-1${i + 3}`, adults: 1, children: 0, cabinClass: "economy", directOnly: false, nearbyAirports: false, alertPriceDropPercent: 5, alertNewLow: true, notificationChannel: "telegram" });
    const res = await cronGET(new Request("http://localhost/api/cron/watchlists", { headers: { authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { watchlists: number; networkCalls: number; outcomes: Record<string, number>; skippedProviders: unknown[] };
    expect(out).toMatchObject({ watchlists: 5, networkCalls: 0, outcomes: { no_provider: 5 } });
    expect(out.skippedProviders.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("an empty watchlist table is also a normal run", async () => {
    const res = await cronGET(new Request("http://localhost/api/cron/watchlists", { headers: { authorization: "Bearer s3cret" } }));
    expect(await res.json()).toMatchObject({ watchlists: 0, networkCalls: 0 });
  });
  it("never leaks the secret in its response", async () => {
    const res = await cronGET(new Request("http://localhost/api/cron/watchlists", { headers: { authorization: "Bearer s3cret" } }));
    expect(JSON.stringify(await res.json())).not.toContain("s3cret");
  });
});

describe("notification settings & Telegram test", () => {
  it("reads defaults, saves toggles, validates, and reports Telegram status without exposing secrets", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:TOPSECRET");
    const r = (await (await settingsGET()).json()) as { settings: { targetAlerts: boolean; cooldownHours: number }; telegram: Record<string, unknown> };
    expect(r.settings).toMatchObject({ targetAlerts: true, cooldownHours: 6 });
    expect(r.telegram).toMatchObject({ tokenSet: true, dryRun: true });
    expect(JSON.stringify(r)).not.toContain("TOPSECRET");
    const saved = (await (await settingsPOST(json("/api/settings/notifications", "POST", { newLowAlerts: false, cooldownHours: 12 }))).json()) as { settings: { newLowAlerts: boolean; cooldownHours: number; targetAlerts: boolean } };
    expect(saved.settings).toMatchObject({ newLowAlerts: false, cooldownHours: 12, targetAlerts: true });
    expect((await settingsPOST(json("/api/settings/notifications", "POST", { cooldownHours: -1 }))).status).toBe(400);
  });
  it("sends a test message through the dry-run path", async () => {
    const res = await testPOST(json("/api/settings/notifications/test", "POST", {}));
    expect(await res.json()).toMatchObject({ ok: true, dryRun: true });
  });
  it("test message fails cleanly (502) when Telegram is not configured and not in dry-run", async () => {
    vi.stubEnv("TELEGRAM_DRY_RUN", "false");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    expect((await testPOST(json("/api/settings/notifications/test", "POST", {}))).status).toBe(502);
  });
});
