import { DEFAULT_SCHEDULE_POLICY, type ProviderSchedulePolicy, type SourceProvider } from "@/providers/types";
import { policyViolation } from "@/features/flight-search/engine";

/**
 * Watchlist Engine ⟂ Provider Search Engine.
 *
 * The Watchlist side decides WHICH provider calls a background run may make by asking each
 * provider's own policy; it never calls providers directly. Phase 2's scheduler will call
 * `planBackgroundRefresh`, then `runSearch({ trigger: "background" })` for the sources that
 * remain (the engine enforces the same policy again as a second barrier).
 *
 * Alert modes:
 *  - "background":   the provider allows polling → alerts can fire from a scheduled run.
 *  - "user_refresh": the provider only answers a user's own search → the watchlist shows
 *                    the last known state, and a new price is only noticed (and alerted)
 *                    when the user opens the app or presses search.
 */
export type AlertMode = "background" | "user_refresh";
export type PartKind = "flight" | "deal";

export interface PlannedCall {
  provider: string;
  part: PartKind;
}

export interface SkippedCall extends PlannedCall {
  reason: string;
  /** "policy": provider forbids background calls · "not_due": minimum interval not reached yet. */
  kind: "policy" | "not_due";
}

export function alertModeFor(policy: ProviderSchedulePolicy | undefined): AlertMode {
  return (policy ?? DEFAULT_SCHEDULE_POLICY).backgroundPolling ? "background" : "user_refresh";
}

export function planBackgroundRefresh(
  sources: SourceProvider[],
  opts: { now: Date; /** ISO time of the last call, keyed "provider:part". */ lastCalledAt?: Record<string, string> },
): { calls: PlannedCall[]; skipped: SkippedCall[]; alertModes: Record<string, AlertMode> } {
  const calls: PlannedCall[] = [];
  const skipped: SkippedCall[] = [];
  const alertModes: Record<string, AlertMode> = {};

  for (const s of sources) {
    const parts: [PartKind, ProviderSchedulePolicy | undefined][] = [];
    if (s.flight) parts.push(["flight", s.flight.schedulePolicy?.()]);
    if (s.deal) parts.push(["deal", s.deal.schedulePolicy?.()]);
    for (const [part, policy] of parts) {
      alertModes[`${s.name}:${part}`] = alertModeFor(policy);
      const violation = policyViolation(policy, "background");
      if (violation) {
        skipped.push({ provider: s.name, part, reason: violation, kind: "policy" });
        continue;
      }
      const last = opts.lastCalledAt?.[`${s.name}:${part}`];
      const interval = policy?.minimumInterval;
      if (last && interval && opts.now.getTime() - Date.parse(last) < interval) {
        skipped.push({ provider: s.name, part, reason: `최소 호출 간격 ${Math.round(interval / 60_000)}분이 지나지 않았습니다.`, kind: "not_due" });
        continue;
      }
      calls.push({ provider: s.name, part });
    }
  }
  return { calls, skipped, alertModes };
}
