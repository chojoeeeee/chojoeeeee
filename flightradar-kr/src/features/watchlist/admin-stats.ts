import type { AlertHistoryEntry, ProviderCallLog, Watchlist } from "./types";

export interface ProviderCallSummary {
  provider: string;
  networkCallsToday: number;
  lastUserSearchAt?: string;
  lastBackgroundSearchAt?: string;
  lastError?: { at: string; message: string };
}

/** Per-provider call statistics for the admin screen. `todayStart` = ISO of the start of today (KST). */
export function summarizeProviderCalls(calls: ProviderCallLog[], todayStart: string): Record<string, ProviderCallSummary> {
  const out: Record<string, ProviderCallSummary> = {};
  for (const c of [...calls].sort((a, b) => a.calledAt.localeCompare(b.calledAt))) {
    const s = (out[c.provider] ??= { provider: c.provider, networkCallsToday: 0 });
    if (c.network && c.calledAt >= todayStart) s.networkCallsToday++;
    if (c.triggerType === "user") s.lastUserSearchAt = c.calledAt;
    else s.lastBackgroundSearchAt = c.calledAt;
    if (c.error) s.lastError = { at: c.calledAt, message: c.error };
  }
  return out;
}

export interface WatchlistAdminStats {
  total: number;
  active: number;
  paused: number;
  /** Distinct provider searches today (a search shared by many watchlists counts once). */
  searchesToday: { user: number; background: number };
  alertsToday: { sent: number; failed: number };
  recentErrors: { at: string; source: string; message: string }[];
}

export function adminStats(input: { watchlists: Watchlist[]; calls: ProviderCallLog[]; alerts: AlertHistoryEntry[]; todayStart: string }): WatchlistAdminStats {
  const today = input.calls.filter((c) => c.calledAt >= input.todayStart);
  const searches = (t: "user" | "background") => new Set(today.filter((c) => c.triggerType === t).map((c) => `${c.searchHash}@${c.calledAt}`)).size;
  const errors = [
    ...input.calls.filter((c) => c.error).map((c) => ({ at: c.calledAt, source: `${c.provider} (${c.part})`, message: c.error! })),
    ...input.alerts.filter((a) => a.status === "failed").map((a) => ({ at: a.sentAt, source: `알림 ${a.channel}`, message: a.error ?? "발송 실패" })),
  ];
  return {
    total: input.watchlists.length,
    active: input.watchlists.filter((w) => w.enabled).length,
    paused: input.watchlists.filter((w) => !w.enabled).length,
    searchesToday: { user: searches("user"), background: searches("background") },
    alertsToday: {
      sent: input.alerts.filter((a) => a.sentAt >= input.todayStart && a.status !== "failed").length,
      failed: input.alerts.filter((a) => a.sentAt >= input.todayStart && a.status === "failed").length,
    },
    recentErrors: errors.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
  };
}
