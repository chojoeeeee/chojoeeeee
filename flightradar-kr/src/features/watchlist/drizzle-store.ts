import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { watchlistSearchHash } from "./search-key";
import {
  defaultNotificationSettings,
  emptyAlertState,
  type AlertHistoryEntry,
  type AlertState,
  type AlertType,
  type NewWatchlist,
  type NotificationSettings,
  type PriceRow,
  type ProviderCallLog,
  type Watchlist,
  type WatchlistPatch,
  type WatchlistStore,
} from "./types";

/** Any Drizzle Postgres database (postgres-js in production, PGlite in tests). */
export type AnyPgDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const date = (s: string | undefined) => (s ? new Date(s) : null);
const OWNER_NAME = "owner";

type WRow = typeof schema.watchlists.$inferSelect;
const toWatchlist = (r: WRow): Watchlist => ({
  id: r.id,
  userId: r.userId,
  origin: r.origin,
  destination: r.destination,
  departureDate: r.departureDate,
  returnDate: r.returnDate ?? undefined,
  adults: r.adults,
  children: r.children,
  cabinClass: r.cabinClass as Watchlist["cabinClass"],
  directOnly: r.directOnly,
  nearbyAirports: r.nearbyAirports,
  targetPrice: r.targetPrice ?? undefined,
  alertPriceDropPercent: r.alertPriceDropPercent,
  alertNewLow: r.alertNewLow,
  notificationChannel: r.notificationChannel,
  enabled: r.enabled,
  searchHash: r.searchHash,
  registeredPrice: r.registeredPrice ?? undefined,
  registeredIsDemo: r.registeredIsDemo,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  lastUserRefreshAt: iso(r.lastUserRefreshAt),
  lastBackgroundRefreshAt: iso(r.lastBackgroundRefreshAt),
});

/** Postgres (Supabase) implementation of WatchlistStore. Server-side only. */
export class DrizzleWatchlistStore implements WatchlistStore {
  constructor(private readonly db: AnyPgDb) {}

  private async ensureUser(userId: string) {
    await this.db.insert(schema.users).values({ id: userId, email: OWNER_NAME }).onConflictDoNothing();
  }

  async createWatchlist(input: NewWatchlist): Promise<Watchlist> {
    await this.ensureUser(input.userId);
    const [row] = await this.db
      .insert(schema.watchlists)
      .values({
        userId: input.userId,
        origin: input.origin,
        destination: input.destination,
        departureDate: input.departureDate,
        returnDate: input.returnDate ?? null,
        adults: input.adults,
        children: input.children,
        cabinClass: input.cabinClass,
        directOnly: input.directOnly,
        nearbyAirports: input.nearbyAirports,
        targetPrice: input.targetPrice ?? null,
        alertPriceDropPercent: input.alertPriceDropPercent,
        alertNewLow: input.alertNewLow,
        notificationChannel: input.notificationChannel,
        enabled: input.enabled ?? true,
        searchHash: watchlistSearchHash(input),
        registeredPrice: input.registeredPrice ?? null,
        registeredIsDemo: input.registeredIsDemo ?? false,
      })
      .returning();
    return toWatchlist(row!);
  }

  async getWatchlist(id: string) {
    const [row] = await this.db.select().from(schema.watchlists).where(eq(schema.watchlists.id, id));
    return row ? toWatchlist(row) : undefined;
  }
  async listWatchlists(userId: string) {
    return (await this.db.select().from(schema.watchlists).where(eq(schema.watchlists.userId, userId)).orderBy(asc(schema.watchlists.createdAt))).map(toWatchlist);
  }
  async listAllWatchlists() {
    return (await this.db.select().from(schema.watchlists).orderBy(asc(schema.watchlists.createdAt))).map(toWatchlist);
  }
  async updateWatchlist(id: string, patch: WatchlistPatch) {
    const set: Partial<typeof schema.watchlists.$inferInsert> = { updatedAt: new Date() };
    if ("targetPrice" in patch) set.targetPrice = patch.targetPrice ?? null;
    if (patch.alertPriceDropPercent !== undefined) set.alertPriceDropPercent = patch.alertPriceDropPercent;
    if (patch.alertNewLow !== undefined) set.alertNewLow = patch.alertNewLow;
    if (patch.enabled !== undefined) set.enabled = patch.enabled;
    if (patch.registeredPrice !== undefined) set.registeredPrice = patch.registeredPrice;
    if (patch.registeredIsDemo !== undefined) set.registeredIsDemo = patch.registeredIsDemo;
    if (patch.lastUserRefreshAt !== undefined) set.lastUserRefreshAt = new Date(patch.lastUserRefreshAt);
    if (patch.lastBackgroundRefreshAt !== undefined) set.lastBackgroundRefreshAt = new Date(patch.lastBackgroundRefreshAt);
    const [row] = await this.db.update(schema.watchlists).set(set).where(eq(schema.watchlists.id, id)).returning();
    return row ? toWatchlist(row) : undefined;
  }
  async deleteWatchlist(id: string) {
    const rows = await this.db.delete(schema.watchlists).where(eq(schema.watchlists.id, id)).returning({ id: schema.watchlists.id });
    return rows.length > 0;
  }

  async addPriceRows(rows: PriceRow[]) {
    if (rows.length === 0) return;
    await this.db.insert(schema.priceHistory).values(
      rows.map((r) => ({
        watchlistId: r.watchlistId,
        runId: r.runId,
        provider: r.provider,
        sourceType: r.sourceType,
        flightKey: r.flightKey,
        price: r.price,
        currency: r.currency,
        airline: r.airline ?? null,
        departureAt: date(r.departureAt),
        returnAt: date(r.returnAt),
        bookingUrl: r.bookingUrl ?? null,
        triggerType: r.triggerType,
        fetchedAt: new Date(r.fetchedAt),
      })),
    );
  }
  async listPriceHistory(watchlistId: string, opts?: { since?: string }): Promise<PriceRow[]> {
    const where = opts?.since ? and(eq(schema.priceHistory.watchlistId, watchlistId), gte(schema.priceHistory.fetchedAt, new Date(opts.since))) : eq(schema.priceHistory.watchlistId, watchlistId);
    const rows = await this.db.select().from(schema.priceHistory).where(where).orderBy(asc(schema.priceHistory.fetchedAt));
    return rows.map((r) => ({
      id: r.id,
      watchlistId: r.watchlistId,
      runId: r.runId,
      provider: r.provider,
      sourceType: r.sourceType,
      flightKey: r.flightKey,
      price: r.price,
      currency: r.currency,
      airline: r.airline ?? undefined,
      departureAt: iso(r.departureAt),
      returnAt: iso(r.returnAt),
      bookingUrl: r.bookingUrl ?? undefined,
      triggerType: r.triggerType,
      fetchedAt: r.fetchedAt.toISOString(),
    }));
  }

  async getAlertState(watchlistId: string): Promise<AlertState> {
    const [r] = await this.db.select().from(schema.alerts).where(eq(schema.alerts.watchlistId, watchlistId));
    if (!r) return emptyAlertState(watchlistId);
    return {
      watchlistId,
      lastNotifiedPrice: r.lastNotifiedPrice ?? undefined,
      lastNotifiedIsDemo: r.lastNotifiedIsDemo,
      lastNotifiedAt: iso(r.lastNotifiedAt),
      targetActive: r.targetActive,
      lastByType: r.lastByType as AlertState["lastByType"],
      notifiedDeals: r.notifiedDeals,
    };
  }
  async saveAlertState(s: AlertState) {
    const values = {
      watchlistId: s.watchlistId,
      lastNotifiedPrice: s.lastNotifiedPrice ?? null,
      lastNotifiedIsDemo: s.lastNotifiedIsDemo,
      lastNotifiedAt: date(s.lastNotifiedAt),
      targetActive: s.targetActive,
      lastByType: s.lastByType as Record<string, string>,
      notifiedDeals: s.notifiedDeals,
    };
    await this.db.insert(schema.alerts).values(values).onConflictDoUpdate({ target: schema.alerts.watchlistId, set: values });
  }
  async addAlertHistory(e: AlertHistoryEntry) {
    await this.db.insert(schema.alertHistory).values({
      watchlistId: e.watchlistId,
      alertType: e.alertType,
      provider: e.provider ?? null,
      oldPrice: e.oldPrice ?? null,
      newPrice: e.newPrice ?? null,
      isDemo: e.isDemo,
      sentAt: new Date(e.sentAt),
      status: e.status,
      channel: e.channel,
      error: e.error ?? null,
    });
  }
  async listAlertHistory(opts?: { watchlistId?: string; since?: string; limit?: number }): Promise<AlertHistoryEntry[]> {
    const conds = [opts?.watchlistId ? eq(schema.alertHistory.watchlistId, opts.watchlistId) : undefined, opts?.since ? gte(schema.alertHistory.sentAt, new Date(opts.since)) : undefined].filter((c) => c !== undefined);
    const rows = await this.db.select().from(schema.alertHistory).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.alertHistory.sentAt)).limit(opts?.limit ?? 200);
    return rows.map((r) => ({
      id: r.id,
      watchlistId: r.watchlistId,
      alertType: r.alertType as AlertType,
      provider: r.provider ?? undefined,
      oldPrice: r.oldPrice ?? undefined,
      newPrice: r.newPrice ?? undefined,
      isDemo: r.isDemo,
      sentAt: r.sentAt.toISOString(),
      status: r.status,
      channel: r.channel,
      error: r.error ?? undefined,
    }));
  }

  async getNotificationSettings(userId: string): Promise<NotificationSettings> {
    const [r] = await this.db.select().from(schema.notificationSettings).where(eq(schema.notificationSettings.userId, userId));
    if (!r) return defaultNotificationSettings(userId);
    return { userId, enabled: r.enabled, targetAlerts: r.targetAlerts, newLowAlerts: r.newLowAlerts, priceDropAlerts: r.priceDropAlerts, relatedDealAlerts: r.relatedDealAlerts, cooldownHours: r.cooldownHours, minDropAmount: r.minDropAmount, telegramChatId: r.telegramChatId ?? undefined };
  }
  async saveNotificationSettings(s: NotificationSettings) {
    await this.ensureUser(s.userId);
    const values = { userId: s.userId, enabled: s.enabled, targetAlerts: s.targetAlerts, newLowAlerts: s.newLowAlerts, priceDropAlerts: s.priceDropAlerts, relatedDealAlerts: s.relatedDealAlerts, cooldownHours: s.cooldownHours, minDropAmount: s.minDropAmount, telegramChatId: s.telegramChatId ?? null, updatedAt: new Date() };
    await this.db.insert(schema.notificationSettings).values(values).onConflictDoUpdate({ target: schema.notificationSettings.userId, set: values });
  }

  async logProviderCall(c: ProviderCallLog) {
    await this.db.insert(schema.providerCalls).values({
      searchHash: c.searchHash,
      provider: c.provider,
      part: c.part,
      triggerType: c.triggerType,
      calledAt: new Date(c.calledAt),
      status: c.status,
      resultCount: c.resultCount,
      network: c.network,
      error: c.error ?? null,
    });
  }
  async listProviderCalls(opts?: { searchHash?: string; since?: string }): Promise<ProviderCallLog[]> {
    const conds = [opts?.searchHash ? eq(schema.providerCalls.searchHash, opts.searchHash) : undefined, opts?.since ? gte(schema.providerCalls.calledAt, new Date(opts.since)) : undefined].filter((c) => c !== undefined);
    const rows = await this.db.select().from(schema.providerCalls).where(conds.length ? and(...conds) : undefined).orderBy(asc(schema.providerCalls.calledAt));
    return rows.map((r) => ({ id: r.id, searchHash: r.searchHash, provider: r.provider, part: r.part, triggerType: r.triggerType, calledAt: r.calledAt.toISOString(), status: r.status, resultCount: r.resultCount, network: r.network, error: r.error ?? undefined }));
  }
}
