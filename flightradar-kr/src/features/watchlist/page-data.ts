import "server-only";
import { planBackgroundRefresh } from "@/features/alerts/background-plan";
import { env } from "@/lib/env";
import { getSources } from "@/providers/sources";
import { getStore, ownerId, storeKind } from "./service";
import { buildView, type WatchlistView } from "./view";

export function isDemoMode(): boolean {
  return env("DEMO_MODE")?.toLowerCase() === "true";
}

export function sourceNames(): Record<string, string> {
  return Object.fromEntries(getSources().map((s) => [s.name, s.displayName]));
}

/** What the user can expect from automatic checking, based on the providers' current policies. */
export function backgroundNote(now = new Date()): string {
  const plan = planBackgroundRefresh(getSources(), { now });
  const names = sourceNames();
  const allowed = [...new Set(plan.calls.map((c) => names[c.provider] ?? c.provider))];
  return allowed.length === 0
    ? "자동 확인 없음 — 서비스 정책상 자동(백그라운드) 조회가 허용되지 않아요. '다시 확인'을 누르면 그때 최신 가격이 반영돼요."
    : `자동 확인: ${allowed.join(", ")}. 그 외 서비스는 '다시 확인'을 눌렀을 때만 확인돼요.`;
}

export async function loadViews(now = new Date()): Promise<WatchlistView[]> {
  const store = getStore();
  const list = await store.listWatchlists(ownerId());
  return Promise.all(list.map(async (w) => buildView(w, await store.listPriceHistory(w.id), now)));
}

export { storeKind };
