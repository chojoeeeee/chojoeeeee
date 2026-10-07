import type { ProviderHealth } from "@/types/domain";
import type { DealProvider } from "./types";

/**
 * Adapter skeleton for promotion/deal services whose official API, feed or
 * terms-compliant public data access has NOT been confirmed. It returns no
 * deals and never invents any. Replace `getDeals` once access is confirmed.
 */
export function createDealStub(cfg: {
  name: string;
  displayName: string;
  status: "api_required" | "partner_required" | "unavailable";
  message: string;
}): DealProvider {
  return {
    name: cfg.name,
    displayName: cfg.displayName,
    isEnabled: () => true,
    async getDeals() {
      return [];
    },
    async healthCheck(): Promise<ProviderHealth> {
      return { provider: cfg.name, status: cfg.status, message: cfg.message, checkedAt: new Date().toISOString() };
    },
  };
}
