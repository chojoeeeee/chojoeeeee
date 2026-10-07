import { generateDemoOffers } from "@/providers/mock/generator";
import type { FlightProvider } from "@/providers/types";
import type { FlightOffer, FlightSearchQuery, FlightSearchRequest } from "@/types/domain";

export const query: FlightSearchQuery = {
  origin: "ICN",
  destination: "NRT",
  departureDate: "2026-11-12",
  returnDate: "2026-11-15",
  adults: 2,
  children: 0,
  cabinClass: "economy",
  directOnly: false,
  currency: "KRW",
};

export const request: FlightSearchRequest = {
  origins: ["ICN"],
  destinations: ["NRT"],
  departureDate: "2026-11-12",
  returnDate: "2026-11-15",
  adults: 2,
  children: 0,
  cabinClass: "economy",
  directOnly: false,
};

export function demoOffers(provider = "p", bias = 1): FlightOffer[] {
  return generateDemoOffers(query, { provider, bias });
}

export function fakeProvider(name: string, impl: FlightProvider["searchFlights"], demo = true): FlightProvider {
  return {
    name,
    displayName: name,
    isEnabled: () => true,
    isDemo: () => demo,
    searchFlights: impl,
    healthCheck: async () => ({ provider: name, status: "connected", checkedAt: new Date().toISOString() }),
  };
}

export function realOffer(over: Partial<FlightOffer> = {}): FlightOffer {
  return { ...demoOffers("real")[0]!, isDemo: false, ...over };
}
