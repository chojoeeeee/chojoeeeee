import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { DrizzleWatchlistStore, type AnyPgDb } from "@/features/watchlist/drizzle-store";
import { MemoryWatchlistStore } from "@/features/watchlist/memory-store";
import { getSharedCaches } from "@/features/flight-search/engine";
import type { FxRates } from "@/features/flight-search/normalize";
import { getDb } from "@/lib/db/client";
import { env, envInt } from "@/lib/env";
import { NotificationService } from "@/lib/notifications/service";
import { TelegramNotificationProvider } from "@/lib/notifications/telegram";
import { getSources } from "@/providers/sources";
import { refreshWatchlists, runBackgroundScheduler, simulateDemoDrop, type RefreshDeps, type RefreshReport, type WatchlistOutcome } from "./refresh";
import type { CreateWatchlistInput } from "./schema";
import { defaultNotificationSettings, type NotificationSettings, type Watchlist, type WatchlistStore } from "./types";

/** Single-owner personal app until Supabase Auth is added: every watchlist belongs to this user. */
export function ownerId(): string {
  return env("OWNER_USER_ID") ?? "00000000-0000-4000-8000-000000000001";
}

const g = globalThis as unknown as { __flightradarStore?: WatchlistStore };

/** Postgres (Supabase) when DATABASE_URL is set, otherwise an in-memory store (lost on restart). */
export function getStore(): WatchlistStore {
  if (!g.__flightradarStore) {
    const db = getDb();
    g.__flightradarStore = db ? new DrizzleWatchlistStore(db as unknown as AnyPgDb) : new MemoryWatchlistStore();
  }
  return g.__flightradarStore;
}

export function storeKind(): "postgres" | "memory" {
  return getDb() ? "postgres" : "memory";
}

export function telegramStatus() {
  const token = Boolean(env("TELEGRAM_BOT_TOKEN"));
  const chat = Boolean(env("TELEGRAM_CHAT_ID"));
  const dryRun = env("TELEGRAM_DRY_RUN")?.toLowerCase() === "true";
  return { tokenSet: token, chatIdSet: chat, dryRun, ready: dryRun || (token && chat) };
}

export function getNotifier(): NotificationService {
  return new NotificationService([
    new TelegramNotificationProvider({ token: env("TELEGRAM_BOT_TOKEN"), chatId: env("TELEGRAM_CHAT_ID"), dryRun: env("TELEGRAM_DRY_RUN")?.toLowerCase() === "true" }),
  ]);
}

function fxRates(): FxRates {
  const rates: FxRates = {};
  for (const cur of ["CNY", "JPY", "USD", "EUR"]) {
    const n = Number(env(`FX_${cur}_KRW`));
    if (Number.isFinite(n) && n > 0) rates[cur] = n;
  }
  return rates;
}

function baseDeps(): Omit<RefreshDeps, "trigger"> {
  return {
    store: getStore(),
    sources: getSources(),
    notifier: getNotifier(),
    // Providers get 15 s by default (10–20 s window); one slow provider never blocks the others.
    timeoutMs: envInt("WATCHLIST_PROVIDER_TIMEOUT_MS", 15_000),
    fxRates: fxRates(),
    userRefreshMinMs: envInt("USER_REFRESH_MIN_SECONDS", 60) * 1000,
  };
}

/** Creates a watchlist and fetches its first prices (a user action; recent search results are reused from the cache). */
export async function createWatchlist(input: CreateWatchlistInput): Promise<{ watchlist: Watchlist; outcome: WatchlistOutcome }> {
  const store = getStore();
  const w = await store.createWatchlist({
    userId: ownerId(),
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    adults: input.adults,
    children: input.children,
    cabinClass: input.cabinClass,
    directOnly: input.directOnly,
    nearbyAirports: input.nearbyAirports,
    targetPrice: input.targetPrice,
    alertPriceDropPercent: input.alertPriceDropPercent,
    alertNewLow: input.alertNewLowest,
    notificationChannel: input.notificationChannel,
    enabled: input.enabled,
  });
  const report = await refreshWatchlists([w], { ...baseDeps(), trigger: "user", skipAlerts: true, ...getSharedCaches(envInt("SEARCH_CACHE_TTL_SECONDS", 900)) });
  return { watchlist: (await store.getWatchlist(w.id)) ?? w, outcome: report.outcomes[0]! };
}

/** The user pressed 다시 확인: trigger = "user", always fresh (no cache), same alert pipeline as the scheduler. */
export async function userRefresh(id: string): Promise<{ outcome?: WatchlistOutcome; report?: RefreshReport }> {
  const store = getStore();
  const w = await store.getWatchlist(id);
  if (!w) return {};
  const report = await refreshWatchlists([w], { ...baseDeps(), trigger: "user" });
  return { outcome: report.outcomes[0], report };
}

export async function schedulerRun(): Promise<RefreshReport> {
  return runBackgroundScheduler(baseDeps());
}

export async function demoDrop(id: string, percent?: number): Promise<WatchlistOutcome | undefined> {
  const store = getStore();
  const w = await store.getWatchlist(id);
  if (!w) return undefined;
  const d = baseDeps();
  return simulateDemoDrop(w, { store, notifier: d.notifier, sources: d.sources, percent });
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  return getStore().getNotificationSettings(ownerId());
}

export async function sendTestNotification() {
  const demo = env("DEMO_MODE")?.toLowerCase() === "true";
  return getNotifier().send("telegram", {
    title: "테스트 알림",
    text: "✅ 항공권 특가 레이더 테스트 알림입니다.\nTelegram 연결이 정상입니다.",
    isDemo: demo,
  });
}

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`. Fails closed when no secret is configured. */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = env("CRON_SECRET");
  if (!secret || !authorization) return false;
  const a = createHash("sha256").update(authorization).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

/** Mutating routes only accept same-origin JSON requests (blocks cross-site form posts). */
export function isSameOriginJson(req: Request): boolean {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export { defaultNotificationSettings };
