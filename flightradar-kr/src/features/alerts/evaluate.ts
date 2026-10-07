import type { RelatedDeal } from "@/features/deal-engine/related";
import type { AlertState, AlertType, NotificationSettings, Watchlist } from "@/features/watchlist/types";

/**
 * Alert Engine — decides, never sends. The same function serves background runs and user
 * refreshes. Only conditions that were MET produce a decision; `shouldNotify` says whether
 * the notification is allowed (or suppressed by cooldown / de-duplication / settings).
 */
export interface AlertDecision {
  type: AlertType;
  shouldNotify: boolean;
  /** Human-readable reason (Korean), also used in the message. */
  reason: string;
  suppressedBy?: "cooldown" | "already_notified" | "disabled";
  oldPrice?: number;
  newPrice?: number;
  deal?: RelatedDeal;
}

export interface EvaluateInput {
  watchlist: Pick<Watchlist, "targetPrice" | "alertPriceDropPercent" | "alertNewLow" | "registeredPrice" | "registeredIsDemo">;
  settings: Pick<NotificationSettings, "enabled" | "targetAlerts" | "newLowAlerts" | "priceDropAlerts" | "relatedDealAlerts" | "cooldownHours" | "minDropAmount">;
  /** Composite price just before this refresh (same data mode), if any. */
  previousPrice?: number;
  /** Current best price and whether it is DEMO data. */
  currentPrice?: number;
  currentIsDemo: boolean;
  /** Earlier composite prices (same data mode), oldest first, EXCLUDING the current one. */
  history: number[];
  state: AlertState;
  /** Deals related to the watchlist (±3 days, similar length). */
  relatedDeals?: RelatedDeal[];
  now: Date;
}

const HOUR = 3_600_000;

function cooldownActive(state: AlertState, type: AlertType, hours: number, now: Date): boolean {
  const last = state.lastByType[type];
  return last !== undefined && now.getTime() - Date.parse(last) < hours * HOUR;
}

export function evaluateAlerts(input: EvaluateInput): AlertDecision[] {
  const { watchlist: w, settings: s, currentPrice: cur, state, now } = input;
  const out: AlertDecision[] = [];

  const gate = (type: AlertType, featureOn: boolean): Pick<AlertDecision, "shouldNotify" | "suppressedBy"> => {
    if (!s.enabled || !featureOn) return { shouldNotify: false, suppressedBy: "disabled" };
    if (cooldownActive(state, type, s.cooldownHours, now)) return { shouldNotify: false, suppressedBy: "cooldown" };
    return { shouldNotify: true };
  };

  if (cur !== undefined) {
    // 1) Target reached — first time only; re-armed once the price goes back above the target.
    if (w.targetPrice !== undefined && cur <= w.targetPrice) {
      const g = state.targetActive ? { shouldNotify: false, suppressedBy: "already_notified" as const } : gate("TARGET_REACHED", s.targetAlerts);
      out.push({ type: "TARGET_REACHED", ...g, reason: `목표가 ${w.targetPrice.toLocaleString("ko-KR")}원 도달`, oldPrice: input.previousPrice, newPrice: cur });
    }

    // 2+3) Further drop vs the last NOTIFIED price (or, before the first alert, the registered price):
    //      ≥ alertPriceDropPercent % OR ≥ minDropAmount KRW.
    const sameMode = (isDemo: boolean) => isDemo === input.currentIsDemo;
    const baseline =
      state.lastNotifiedPrice !== undefined && sameMode(state.lastNotifiedIsDemo)
        ? state.lastNotifiedPrice
        : w.registeredPrice !== undefined && sameMode(w.registeredIsDemo)
          ? w.registeredPrice
          : undefined;
    if (baseline !== undefined && cur < baseline) {
      const dropAmount = baseline - cur;
      const dropPercent = (dropAmount / baseline) * 100;
      if (dropPercent >= w.alertPriceDropPercent || dropAmount >= s.minDropAmount) {
        out.push({
          type: "PRICE_DROP",
          ...gate("PRICE_DROP", s.priceDropAlerts),
          reason: `${dropAmount.toLocaleString("ko-KR")}원(${dropPercent.toFixed(1)}%) 하락`,
          oldPrice: baseline,
          newPrice: cur,
        });
      }
    }

    // 4) New all-time low (needs earlier observations to compare with).
    if (w.alertNewLow && input.history.length > 0 && cur < Math.min(...input.history)) {
      out.push({ type: "NEW_LOW", ...gate("NEW_LOW", s.newLowAlerts), reason: "새로운 최저가", oldPrice: Math.min(...input.history), newPrice: cur });
    }
  }

  // 5) Related deals (±3 days, similar trip length — decided by the deal engine). One notice per deal,
  //    again only if its price fell by the same thresholds since it was last notified.
  for (const r of input.relatedDeals ?? []) {
    if (r.match === "destination_only" && w.targetPrice === undefined) continue; // no dates & no target: not actionable
    const price = r.deal.price;
    // Worth telling about only if cheaper than the current fare, or within the target.
    const cheaper = cur !== undefined ? price < cur : w.targetPrice !== undefined && price <= w.targetPrice;
    if (!cheaper) continue;
    const seen = state.notifiedDeals[r.deal.id];
    if (seen && !(seen.price - price >= s.minDropAmount || ((seen.price - price) / seen.price) * 100 >= w.alertPriceDropPercent)) continue;
    out.push({ type: "RELATED_DEAL", ...gate("RELATED_DEAL", s.relatedDealAlerts), reason: "비슷한 일정의 특가 발견", oldPrice: cur, newPrice: price, deal: r });
  }

  return out;
}

/**
 * State after a notification went out. `notified` are the decisions that were actually delivered.
 * Also re-arms the target when the price is back above it.
 */
export function nextAlertState(state: AlertState, ctx: { notified: AlertDecision[]; currentPrice?: number; currentIsDemo: boolean; targetPrice?: number; now: Date }): AlertState {
  const next: AlertState = { ...state, lastByType: { ...state.lastByType }, notifiedDeals: { ...state.notifiedDeals } };
  const stamp = ctx.now.toISOString();
  for (const d of ctx.notified) {
    next.lastByType[d.type] = stamp;
    if (d.type === "TARGET_REACHED") next.targetActive = true;
    if (d.type === "RELATED_DEAL" && d.deal) next.notifiedDeals[d.deal.deal.id] = { price: d.deal.deal.price, at: stamp };
  }
  const flightNotified = ctx.notified.some((d) => d.type !== "RELATED_DEAL");
  if (flightNotified && ctx.currentPrice !== undefined) {
    next.lastNotifiedPrice = ctx.currentPrice;
    next.lastNotifiedIsDemo = ctx.currentIsDemo;
    next.lastNotifiedAt = stamp;
  }
  // Re-arm: once the price is above the target again, the next time it reaches it counts as "first" again.
  if (ctx.targetPrice !== undefined && ctx.currentPrice !== undefined && ctx.currentPrice > ctx.targetPrice) next.targetActive = false;
  return next;
}
