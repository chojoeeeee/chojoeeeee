import type { FlightProvider } from "../types";
import type { ProviderHealth } from "@/types/domain";
import { generateDemoOffers } from "./generator";

export function createMockProvider(cfg: {
  name: string;
  displayName: string;
  bias: number;
  carriers?: string[];
}): FlightProvider {
  return {
    name: cfg.name,
    displayName: cfg.displayName,
    isEnabled: () => true,
    isDemo: () => true,
    async searchFlights(query) {
      return generateDemoOffers(query, { provider: cfg.name, bias: cfg.bias, carriers: cfg.carriers });
    },
    async healthCheck(): Promise<ProviderHealth> {
      return { provider: cfg.name, status: "demo", message: "DEMO DATA", checkedAt: new Date().toISOString() };
    },
  };
}

/** Two independent demo sellers with overlapping carriers so comparison UI has something to compare. */
export const mockProviderA = createMockProvider({ name: "mock-a", displayName: "데모 여행사 A", bias: 1.0 });
export const mockProviderB = createMockProvider({
  name: "mock-b",
  displayName: "데모 여행사 B",
  bias: 1.04,
  carriers: ["7C", "KE", "OZ", "TW", "BX"],
});
