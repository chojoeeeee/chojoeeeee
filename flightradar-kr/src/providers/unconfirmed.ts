import "server-only";
import type { ProviderHealth } from "@/types/domain";
import { demoEnabled } from "./demo-mode";
import { generateDemoDeals, generateDemoOffers } from "./mock/generator";
import { ProviderUnavailableError, type DealProvider, type FlightProvider, type SourceProvider } from "./types";

/**
 * Adapter for a service whose official API / feed / terms-compliant public
 * access is NOT confirmed. It is still queried on every search and reports
 * `manual_check` so the UI shows the service with a link to check by hand.
 * It never fabricates data; only with DEMO_MODE does it return flagged demo data.
 *
 * To connect the service for real, replace `flight` / `deal` in its own
 * providers/<name>/index.ts — nothing else changes.
 */
export function createUnconfirmedSource(cfg: {
  name: string;
  displayName: string;
  checkUrl: string;
  checkLabel: string;
  reason: string;
  demo?: { flightBias?: number; deals?: boolean };
}): SourceProvider {
  const manual = () => new ProviderUnavailableError(cfg.name, "manual_check", cfg.reason);
  const health = async (): Promise<ProviderHealth> => ({
    provider: cfg.name,
    status: "manual_check",
    message: cfg.reason,
    checkedAt: new Date().toISOString(),
  });

  const flight: FlightProvider = {
    name: cfg.name,
    displayName: cfg.displayName,
    isEnabled: () => true,
    isDemo: () => demoEnabled() && cfg.demo?.flightBias !== undefined,
    async searchFlights(query) {
      if (demoEnabled() && cfg.demo?.flightBias !== undefined) {
        return generateDemoOffers(query, { provider: cfg.name, bias: cfg.demo.flightBias });
      }
      throw manual();
    },
    healthCheck: health,
  };

  const deal: DealProvider = {
    name: cfg.name,
    displayName: cfg.displayName,
    isEnabled: () => true,
    async getDeals(query) {
      if (demoEnabled() && cfg.demo?.deals) return generateDemoDeals(query, cfg.name);
      throw manual();
    },
    healthCheck: health,
  };

  return {
    name: cfg.name,
    displayName: cfg.displayName,
    checkUrl: cfg.checkUrl,
    checkLabel: cfg.checkLabel,
    directUrl: () => cfg.checkUrl, // search URL formats are unverified → no deep link
    flight,
    deal,
  };
}
