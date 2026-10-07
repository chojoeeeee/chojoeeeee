import type { AlertHistoryEntry, AlertState } from "@/features/watchlist/types";
import { emptyAlertState } from "@/features/watchlist/types";

/**
 * The alert state is not stored separately — it is derived from alert_history, the single record
 * of what was sent. This is what stops repeat notifications after a restart or a new deployment.
 * Only delivered (sent / dry_run) entries count; a failed send is retried.
 *
 * `priorSeries`: earlier composite prices (same data mode). The target alert re-arms once the
 * price was above the target again after the last TARGET_REACHED alert.
 */
export function deriveAlertState(watchlistId: string, history: AlertHistoryEntry[], opts: { targetPrice?: number; priorSeries?: { at: string; price: number }[] } = {}): AlertState {
  const state = emptyAlertState(watchlistId);
  const delivered = history.filter((h) => h.watchlistId === watchlistId && h.status !== "failed").sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  for (const h of delivered) {
    state.lastByType[h.alertType] = h.sentAt;
    if (h.alertType === "RELATED_DEAL") {
      if (h.dedupeKey && h.newPrice !== undefined) state.notifiedDeals[h.dedupeKey] = { price: h.newPrice, at: h.sentAt };
    } else if (h.newPrice !== undefined) {
      state.lastNotifiedPrice = h.newPrice;
      state.lastNotifiedIsDemo = h.isDemo;
      state.lastNotifiedAt = h.sentAt;
    }
  }
  const lastTarget = state.lastByType.TARGET_REACHED;
  if (lastTarget) {
    const rearmed = opts.targetPrice !== undefined && (opts.priorSeries ?? []).some((p) => Date.parse(p.at) > Date.parse(lastTarget) && p.price > opts.targetPrice!);
    state.targetActive = !rearmed;
  }
  return state;
}
