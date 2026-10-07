import { randomUUID } from "node:crypto";
import { watchlistSearchHash } from "./search-key";
import {
  defaultNotificationSettings,
  type AlertHistoryEntry,
  type NewWatchlist,
  type NotificationSettings,
  type PriceRow,
  type ProviderRunLog,
  type Watchlist,
  type WatchlistPatch,
  type WatchlistStore,
} from "./types";

const clone = <T>(v: T): T => structuredClone(v);
const after = (iso: string, since?: string) => since === undefined || Date.parse(iso) >= Date.parse(since);

/** In-memory store: development, tests and DEMO without a database. Data is lost on restart. */
export class MemoryWatchlistStore implements WatchlistStore {
  private watchlists = new Map<string, Watchlist>();
  private prices: PriceRow[] = [];
  private history: AlertHistoryEntry[] = [];
  private settings = new Map<string, NotificationSettings>();
  private calls: ProviderRunLog[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createWatchlist(input: NewWatchlist): Promise<Watchlist> {
    const ts = this.now().toISOString();
    const w: Watchlist = { enabled: true, initialIsDemo: false, flexibleDays: 0, ...input, id: randomUUID(), searchHash: watchlistSearchHash(input), createdAt: ts, updatedAt: ts };
    this.watchlists.set(w.id, w);
    return clone(w);
  }
  async getWatchlist(id: string) {
    const w = this.watchlists.get(id);
    return w ? clone(w) : undefined;
  }
  async listWatchlists(userId: string) {
    return [...this.watchlists.values()].filter((w) => w.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
  }
  async listWatchlistsBySearchHash(searchHash: string) {
    return [...this.watchlists.values()].filter((w) => w.searchHash === searchHash).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
  }
  async listAllWatchlists() {
    return [...this.watchlists.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(clone);
  }
  async updateWatchlist(id: string, patch: WatchlistPatch) {
    const w = this.watchlists.get(id);
    if (!w) return undefined;
    const { targetPrice, ...rest } = patch;
    Object.assign(w, rest, { updatedAt: this.now().toISOString() });
    if ("targetPrice" in patch) w.targetPrice = targetPrice ?? undefined;
    return clone(w);
  }
  async deleteWatchlist(id: string) {
    const existed = this.watchlists.delete(id);
    this.prices = this.prices.filter((p) => p.watchlistId !== id);
    this.history = this.history.filter((h) => h.watchlistId !== id);
    return existed;
  }

  async addPriceRows(rows: PriceRow[]) {
    for (const r of rows) this.prices.push({ ...clone(r), id: r.id ?? randomUUID() });
  }
  async listPriceHistory(watchlistId: string, opts?: { since?: string }) {
    return this.prices.filter((p) => p.watchlistId === watchlistId && after(p.fetchedAt, opts?.since)).sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt)).map(clone);
  }

  async countPriceRows() {
    return this.prices.length;
  }
  async addAlertHistory(entry: AlertHistoryEntry) {
    this.history.push({ ...clone(entry), id: entry.id ?? randomUUID() });
  }
  async listAlertHistory(opts?: { watchlistId?: string; since?: string; limit?: number }) {
    return this.history
      .filter((h) => (opts?.watchlistId === undefined || h.watchlistId === opts.watchlistId) && after(h.sentAt, opts?.since))
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
      .slice(0, opts?.limit ?? 200)
      .map(clone);
  }

  async getNotificationSettings(userId: string) {
    return clone(this.settings.get(userId) ?? defaultNotificationSettings(userId));
  }
  async saveNotificationSettings(s: NotificationSettings) {
    this.settings.set(s.userId, clone(s));
  }

  async logProviderRun(call: ProviderRunLog) {
    this.calls.push({ ...clone(call), id: call.id ?? randomUUID() });
  }
  async listProviderRuns(opts?: { searchHash?: string; since?: string }) {
    return this.calls.filter((c) => (opts?.searchHash === undefined || c.searchHash === opts.searchHash) && after(c.calledAt, opts?.since)).map(clone);
  }

  async health() {
    return { ok: true, kind: "memory" as const };
  }
}
