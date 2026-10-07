import { generateDemoOffers } from "@/providers/mock/generator";
import type { DealProvider, FlightProvider, SourceProvider } from "@/providers/types";
import type { DealQuery, FlightOffer, FlightSearchQuery, FlightSearchRequest, TravelDeal } from "@/types/domain";

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

export function fakeDeal(name: string, impl: DealProvider["getDeals"]): DealProvider {
  return {
    name,
    displayName: name,
    isEnabled: () => true,
    getDeals: impl,
    healthCheck: async () => ({ provider: name, status: "connected", checkedAt: new Date().toISOString() }),
  };
}

export function fakeSource(name: string, parts: { flight?: FlightProvider["searchFlights"]; deal?: DealProvider["getDeals"]; demo?: boolean }): SourceProvider {
  return {
    name,
    displayName: name,
    checkUrl: `https://example.com/${name}`,
    checkLabel: "사이트에서 직접 확인",
    directUrl: () => `https://example.com/${name}?search`,
    flight: parts.flight ? fakeProvider(name, parts.flight, parts.demo ?? true) : undefined,
    deal: parts.deal ? fakeDeal(name, parts.deal) : undefined,
  };
}

export function dealQuery(over: Partial<DealQuery> = {}): DealQuery {
  return { origins: ["ICN"], destinations: ["NRT"], departureDate: "2026-11-12", returnDate: "2026-11-15", keywords: [], ...over };
}

export function deal(over: Partial<TravelDeal> = {}): TravelDeal {
  return {
    id: "d1",
    provider: "playwings",
    isDemo: false,
    title: "도쿄 왕복",
    origin: "ICN",
    destination: "NRT",
    travelStartDate: "2026-11-11",
    travelEndDate: "2026-11-14",
    price: 129000,
    currency: "KRW",
    bookingUrl: "https://example.com/deal",
    publishedAt: "2026-10-07T00:00:00Z",
    rawSource: "test",
    ...over,
  };
}
