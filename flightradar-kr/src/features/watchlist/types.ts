import type { CabinClass, SourceType } from "@/types/domain";

export type TriggerType = "user" | "background" | "deal";
export type AlertType = "TARGET_REACHED" | "PRICE_DROP" | "NEW_LOW" | "RELATED_DEAL";
export type NotificationChannel = "telegram";

export interface Watchlist {
  id: string;
  userId: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  cabinClass: CabinClass;
  directOnly: boolean;
  nearbyAirports: boolean;
  targetPrice?: number;
  alertPriceDropPercent: number;
  alertNewLow: boolean;
  notificationChannel: NotificationChannel;
  enabled: boolean;
  /** Same hash ⇒ same provider search (shared between watchlists). */
  searchHash: string;
  /** Per-person price at registration, and whether it was DEMO data. */
  registeredPrice?: number;
  registeredIsDemo: boolean;
  createdAt: string;
  updatedAt: string;
  lastUserRefreshAt?: string;
  lastBackgroundRefreshAt?: string;
}

export type NewWatchlist = Omit<Watchlist, "id" | "createdAt" | "updatedAt" | "searchHash" | "registeredIsDemo" | "enabled" | "lastUserRefreshAt" | "lastBackgroundRefreshAt"> &
  Partial<Pick<Watchlist, "enabled" | "registeredIsDemo">>;

/** `targetPrice: null` clears the target. */
export type WatchlistPatch = Partial<Pick<Watchlist, "alertPriceDropPercent" | "alertNewLow" | "enabled" | "registeredPrice" | "registeredIsDemo" | "lastUserRefreshAt" | "lastBackgroundRefreshAt">> & { targetPrice?: number | null };

/** One observed price (per person). `sourceType === "demo"` rows are DEMO DATA. */
export interface PriceRow {
  id?: string;
  watchlistId: string;
  runId: string;
  provider: string;
  sourceType: SourceType;
  flightKey: string;
  price: number;
  currency: string;
  airline?: string;
  departureAt?: string;
  returnAt?: string;
  bookingUrl?: string;
  triggerType: TriggerType;
  fetchedAt: string;
}

export const isDemoRow = (r: Pick<PriceRow, "sourceType">) => r.sourceType === "demo";

export interface AlertState {
  watchlistId: string;
  lastNotifiedPrice?: number;
  lastNotifiedIsDemo: boolean;
  lastNotifiedAt?: string;
  targetActive: boolean;
  lastByType: Partial<Record<AlertType, string>>;
  notifiedDeals: Record<string, { price: number; at: string }>;
}

export const emptyAlertState = (watchlistId: string): AlertState => ({ watchlistId, lastNotifiedIsDemo: false, targetActive: false, lastByType: {}, notifiedDeals: {} });

export interface AlertHistoryEntry {
  id?: string;
  watchlistId: string;
  alertType: AlertType;
  provider?: string;
  oldPrice?: number;
  newPrice?: number;
  isDemo: boolean;
  sentAt: string;
  status: "sent" | "dry_run" | "failed";
  channel: string;
  error?: string;
}

export interface NotificationSettings {
  userId: string;
  enabled: boolean;
  targetAlerts: boolean;
  newLowAlerts: boolean;
  priceDropAlerts: boolean;
  relatedDealAlerts: boolean;
  cooldownHours: number;
  minDropAmount: number;
  telegramChatId?: string;
}

export const defaultNotificationSettings = (userId: string): NotificationSettings => ({
  userId,
  enabled: true,
  targetAlerts: true,
  newLowAlerts: true,
  priceDropAlerts: true,
  relatedDealAlerts: true,
  cooldownHours: 6,
  minDropAmount: 10_000,
});

export interface ProviderCallLog {
  id?: string;
  searchHash: string;
  provider: string;
  part: "flight" | "deal";
  triggerType: "user" | "background";
  calledAt: string;
  status: string;
  resultCount: number;
  /** A real outbound request was made (false for demo / manual / skipped). */
  network: boolean;
  error?: string;
}

export interface WatchlistStore {
  createWatchlist(input: NewWatchlist): Promise<Watchlist>;
  getWatchlist(id: string): Promise<Watchlist | undefined>;
  listWatchlists(userId: string): Promise<Watchlist[]>;
  /** Every watchlist of every user (scheduler / admin). */
  listAllWatchlists(): Promise<Watchlist[]>;
  updateWatchlist(id: string, patch: WatchlistPatch): Promise<Watchlist | undefined>;
  deleteWatchlist(id: string): Promise<boolean>;

  addPriceRows(rows: PriceRow[]): Promise<void>;
  listPriceHistory(watchlistId: string, opts?: { since?: string }): Promise<PriceRow[]>;

  getAlertState(watchlistId: string): Promise<AlertState>;
  saveAlertState(state: AlertState): Promise<void>;
  addAlertHistory(entry: AlertHistoryEntry): Promise<void>;
  listAlertHistory(opts?: { watchlistId?: string; since?: string; limit?: number }): Promise<AlertHistoryEntry[]>;

  getNotificationSettings(userId: string): Promise<NotificationSettings>;
  saveNotificationSettings(settings: NotificationSettings): Promise<void>;

  logProviderCall(call: ProviderCallLog): Promise<void>;
  listProviderCalls(opts?: { searchHash?: string; since?: string }): Promise<ProviderCallLog[]>;
}
