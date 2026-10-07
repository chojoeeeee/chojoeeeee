import "server-only";
import type { ProviderHealth } from "@/types/domain";
import { demoEnabled } from "./demo-mode";
import { generateDemoDeals, generateDemoOffers } from "./mock/generator";
import { ProviderUnavailableError, type DealProvider, type FlightProvider, type ProviderSchedulePolicy, type SourceProvider, type SourceRole } from "./types";

/**
 * Adapter for a service whose official API / feed / terms-compliant public
 * access is NOT confirmed. It is still queried on every search and reports
 * `manual_check` so the UI shows the service with a link to check by hand.
 * It never fabricates data; only with DEMO_MODE does it return flagged demo data.
 *
 * To connect the service for real, replace it in its own providers/<name>/index.ts.
 */
export function createUnconfirmedSource(cfg: {
  name: string;
  displayName: string;
  role: SourceRole;
  /** Which kinds of data this service can eventually provide. */
  parts: "flight" | "deal" | "both";
  checkUrl: string;
  checkLabel: string;
  reason: string;
  demo?: { flightBias?: number; deals?: boolean };
}): SourceProvider {
  const manual = () => new ProviderUnavailableError(cfg.name, "manual_check", cfg.reason);
  const policy = (): ProviderSchedulePolicy => ({ userInitiatedSearch: false, backgroundPolling: false, policyStatus: "unverified", notes: "자동 수집 방식·약관 미확인 — 호출하지 않음" });
  const health = async (): Promise<ProviderHealth> => ({ provider: cfg.name, status: "manual_check", message: cfg.reason, checkedAt: new Date().toISOString() });

  const flight: FlightProvider = {
    name: cfg.name,
    displayName: cfg.displayName,
    isEnabled: () => true,
    isDemo: () => demoEnabled() && cfg.demo?.flightBias !== undefined,
    schedulePolicy: policy,
    async searchFlights(query) {
      if (demoEnabled() && cfg.demo?.flightBias !== undefined) return generateDemoOffers(query, { provider: cfg.name, bias: cfg.demo.flightBias });
      throw manual();
    },
    healthCheck: health,
  };

  const deal: DealProvider = {
    name: cfg.name,
    displayName: cfg.displayName,
    isEnabled: () => true,
    schedulePolicy: policy,
    async getDeals(query) {
      if (demoEnabled() && cfg.demo?.deals) return generateDemoDeals(query, cfg.name);
      throw manual();
    },
    healthCheck: health,
  };

  return {
    name: cfg.name,
    displayName: cfg.displayName,
    role: cfg.role,
    checkUrl: cfg.checkUrl,
    checkLabel: cfg.checkLabel,
    directUrl: () => cfg.checkUrl, // search URL formats are unverified → no deep link
    flight: cfg.parts === "deal" ? undefined : flight,
    deal: cfg.parts === "flight" ? undefined : deal,
  };
}
