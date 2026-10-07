import { compositeSeries, currentPrice, dealScore, priceStats, selectMode, type DataMode, type DealScore, type PriceStats } from "@/features/price-history/stats";
import type { PriceRow, Watchlist } from "./types";

/** Everything a watchlist card / detail page needs, computed from stored rows. Client-safe and serialisable. */
export type StatusKey = "no_price" | "paused" | "target_reached" | "waiting" | "tracking";

export interface WatchlistView {
  watchlist: Watchlist;
  mode: DataMode;
  stats: PriceStats;
  score?: DealScore;
  statusKey: StatusKey;
  /** Latest check of any kind (user or background). */
  lastCheckedAt?: string;
}

export const STATUS_TEXT: Record<StatusKey, string> = {
  no_price: "가격 확인 전",
  paused: "일시정지",
  target_reached: "🎯 목표가 도달",
  waiting: "목표가 대기 중",
  tracking: "가격 추적 중",
};

export function buildView(w: Watchlist, rows: PriceRow[], now: Date): WatchlistView {
  const stats = priceStats(rows, { now, registeredPrice: w.registeredPrice, registeredIsDemo: w.registeredIsDemo });
  const { rows: usable } = selectMode(rows);
  const series = compositeSeries(usable);
  const cur = currentPrice(rows, now);
  const score = cur ? dealScore({ current: cur.price, target: w.targetPrice, priorPrices: series.slice(0, -1).map((p) => p.price) }) : undefined;
  const statusKey: StatusKey = !cur ? "no_price" : !w.enabled ? "paused" : w.targetPrice === undefined ? "tracking" : cur.price <= w.targetPrice ? "target_reached" : "waiting";
  const checks = [w.lastUserRefreshAt, w.lastBackgroundRefreshAt].filter((x): x is string => Boolean(x));
  return { watchlist: w, mode: stats.mode, stats, score, statusKey, lastCheckedAt: checks.sort().at(-1) };
}
