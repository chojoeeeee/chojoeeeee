import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryWatchlistStore } from "@/features/watchlist/memory-store";
import { watchlistSearchHash } from "@/features/watchlist/search-key";
import { emptyAlertState, type NewWatchlist, type PriceRow, type WatchlistStore } from "@/features/watchlist/types";
import { createPgliteStore } from "./db-helpers";

const USER = "00000000-0000-4000-8000-000000000001";
const base: NewWatchlist = {
  userId: USER,
  origin: "ICN",
  destination: "NRT",
  departureDate: "2026-11-12",
  returnDate: "2026-11-15",
  adults: 2,
  children: 0,
  cabinClass: "economy",
  directOnly: false,
  nearbyAirports: false,
  targetPrice: 170000,
  alertPriceDropPercent: 5,
  alertNewLow: true,
  notificationChannel: "telegram",
  registeredPrice: 189000,
};

function row(watchlistId: string, over: Partial<PriceRow> = {}): PriceRow {
  return { watchlistId, runId: "r1", provider: "skyscanner", sourceType: "api", flightKey: "k1", price: 189000, currency: "KRW", airline: "제주항공", bookingUrl: "https://example.com/x", triggerType: "user", fetchedAt: "2026-10-07T09:00:00.000Z", ...over };
}

function contract(name: string, make: () => Promise<{ store: WatchlistStore; close?: () => Promise<void> }>) {
  describe(`WatchlistStore contract: ${name}`, () => {
    let store: WatchlistStore;
    let close: (() => Promise<void>) | undefined;
    beforeAll(async () => {
      ({ store, close } = await make());
    });
    afterAll(async () => close?.());

    it("creates, reads, lists and deletes a watchlist (with its search hash)", async () => {
      const w = await store.createWatchlist(base);
      expect(w).toMatchObject({ origin: "ICN", destination: "NRT", targetPrice: 170000, enabled: true, registeredPrice: 189000, registeredIsDemo: false });
      expect(w.searchHash).toBe(watchlistSearchHash(base));
      expect(await store.getWatchlist(w.id)).toEqual(w);
      expect((await store.listWatchlists(USER)).map((x) => x.id)).toContain(w.id);
      expect(await store.listWatchlists("00000000-0000-4000-8000-0000000000ff")).toEqual([]);
      expect(await store.deleteWatchlist(w.id)).toBe(true);
      expect(await store.getWatchlist(w.id)).toBeUndefined();
      expect(await store.deleteWatchlist(w.id)).toBe(false);
    });

    it("updates: pause / resume, target change, clear target, refresh timestamps", async () => {
      const w = await store.createWatchlist(base);
      expect((await store.updateWatchlist(w.id, { enabled: false }))?.enabled).toBe(false);
      expect((await store.updateWatchlist(w.id, { enabled: true, targetPrice: 160000 }))).toMatchObject({ enabled: true, targetPrice: 160000 });
      expect((await store.updateWatchlist(w.id, { targetPrice: null }))?.targetPrice).toBeUndefined();
      const ts = "2026-10-07T10:00:00.000Z";
      expect(await store.updateWatchlist(w.id, { lastUserRefreshAt: ts, lastBackgroundRefreshAt: ts })).toMatchObject({ lastUserRefreshAt: ts, lastBackgroundRefreshAt: ts });
      expect(await store.updateWatchlist("00000000-0000-4000-8000-0000000000aa", { enabled: false })).toBeUndefined();
      await store.deleteWatchlist(w.id);
    });

    it("stores price history in time order, filters by since, and DEMO rows keep their source type", async () => {
      const w = await store.createWatchlist(base);
      await store.addPriceRows([
        row(w.id, { runId: "r2", fetchedAt: "2026-10-07T11:00:00.000Z", price: 180000 }),
        row(w.id, { runId: "r1", fetchedAt: "2026-10-07T09:00:00.000Z" }),
        row(w.id, { runId: "r3", provider: "demo", sourceType: "demo", fetchedAt: "2026-10-07T12:00:00.000Z", price: 170000, triggerType: "background" }),
      ]);
      const all = await store.listPriceHistory(w.id);
      expect(all.map((r) => r.price)).toEqual([189000, 180000, 170000]);
      expect(all[2]).toMatchObject({ sourceType: "demo", triggerType: "background", bookingUrl: "https://example.com/x" });
      expect((await store.listPriceHistory(w.id, { since: "2026-10-07T10:00:00.000Z" })).map((r) => r.price)).toEqual([180000, 170000]);
      await store.deleteWatchlist(w.id);
    });

    it("deleting a watchlist removes its history and alert state", async () => {
      const w = await store.createWatchlist(base);
      await store.addPriceRows([row(w.id)]);
      await store.saveAlertState({ ...emptyAlertState(w.id), lastNotifiedPrice: 1 });
      await store.addAlertHistory({ watchlistId: w.id, alertType: "NEW_LOW", isDemo: false, sentAt: "2026-10-07T09:00:00.000Z", status: "sent", channel: "telegram" });
      await store.deleteWatchlist(w.id);
      expect(await store.listPriceHistory(w.id)).toEqual([]);
      expect(await store.listAlertHistory({ watchlistId: w.id })).toEqual([]);
      expect((await store.getAlertState(w.id)).lastNotifiedPrice).toBeUndefined();
    });

    it("alert state: defaults, upsert and JSON fields round-trip", async () => {
      const w = await store.createWatchlist(base);
      expect(await store.getAlertState(w.id)).toEqual(emptyAlertState(w.id));
      const s = { ...emptyAlertState(w.id), lastNotifiedPrice: 169000, lastNotifiedIsDemo: true, lastNotifiedAt: "2026-10-07T09:00:00.000Z", targetActive: true, lastByType: { TARGET_REACHED: "2026-10-07T09:00:00.000Z" }, notifiedDeals: { d1: { price: 139000, at: "2026-10-07T09:00:00.000Z" } } };
      await store.saveAlertState(s);
      expect(await store.getAlertState(w.id)).toEqual(s);
      await store.saveAlertState({ ...s, targetActive: false });
      expect((await store.getAlertState(w.id)).targetActive).toBe(false);
      await store.deleteWatchlist(w.id);
    });

    it("alert history: newest first, filters and limit", async () => {
      const w = await store.createWatchlist(base);
      for (const [i, status] of (["sent", "dry_run", "failed"] as const).entries()) {
        await store.addAlertHistory({ watchlistId: w.id, alertType: "PRICE_DROP", provider: "skyscanner", oldPrice: 189000, newPrice: 169000 - i, isDemo: false, sentAt: `2026-10-07T0${i + 1}:00:00.000Z`, status, channel: "telegram", error: status === "failed" ? "boom" : undefined });
      }
      const list = await store.listAlertHistory({ watchlistId: w.id });
      expect(list.map((h) => h.status)).toEqual(["failed", "dry_run", "sent"]);
      expect(list[0]).toMatchObject({ error: "boom", provider: "skyscanner", oldPrice: 189000 });
      expect(await store.listAlertHistory({ watchlistId: w.id, limit: 1 })).toHaveLength(1);
      expect((await store.listAlertHistory({ watchlistId: w.id, since: "2026-10-07T02:00:00.000Z" })).length).toBe(2);
      await store.deleteWatchlist(w.id);
    });

    it("notification settings: defaults then saved values", async () => {
      const uid = "00000000-0000-4000-8000-0000000000bb";
      const d = await store.getNotificationSettings(uid);
      expect(d).toMatchObject({ enabled: true, cooldownHours: 6, minDropAmount: 10000, targetAlerts: true });
      await store.saveNotificationSettings({ ...d, targetAlerts: false, cooldownHours: 12, telegramChatId: "123" });
      expect(await store.getNotificationSettings(uid)).toMatchObject({ targetAlerts: false, cooldownHours: 12, telegramChatId: "123" });
    });

    it("provider calls: logged, filtered by search hash and time", async () => {
      await store.logProviderCall({ searchHash: "h1", provider: "skyscanner", part: "flight", triggerType: "user", calledAt: "2026-10-07T09:00:00.000Z", status: "ok", resultCount: 6, network: true });
      await store.logProviderCall({ searchHash: "h2", provider: "catchfrog", part: "deal", triggerType: "background", calledAt: "2026-10-07T10:00:00.000Z", status: "error", resultCount: 0, network: true, error: "timeout" });
      expect((await store.listProviderCalls({ searchHash: "h1" })).map((c) => c.provider)).toEqual(["skyscanner"]);
      const recent = await store.listProviderCalls({ since: "2026-10-07T09:30:00.000Z" });
      expect(recent.find((c) => c.searchHash === "h2")).toMatchObject({ error: "timeout", triggerType: "background", network: true });
    });
  });
}

contract("memory", async () => ({ store: new MemoryWatchlistStore() }));
contract("postgres (PGlite + real migrations)", createPgliteStore);

describe("migrations", () => {
  it("enable Row Level Security on every table (Supabase public API stays closed)", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const client = new PGlite();
    const dir = path.resolve(__dirname, "../drizzle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort())
      for (const stmt of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.exec(stmt);
    const res = await client.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace");
    expect(res.rows.length).toBeGreaterThanOrEqual(10);
    expect(res.rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    await client.close();
  });
});
