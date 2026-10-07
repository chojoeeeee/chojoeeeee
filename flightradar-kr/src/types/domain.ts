export type CabinClass = "economy" | "premium_economy" | "business" | "first";

/** A single origin → destination search sent to a provider. */
export interface FlightSearchQuery {
  origin: string; // IATA airport code, e.g. "ICN"
  destination: string; // IATA airport code, e.g. "NRT"
  departureDate: string; // YYYY-MM-DD
  returnDate?: string; // YYYY-MM-DD, omitted for one-way
  adults: number;
  children: number;
  cabinClass: CabinClass;
  directOnly: boolean;
  currency: string; // ISO 4217; providers should return prices in this currency
}

/** Query as entered by the user: may span several airports. */
export interface FlightSearchRequest {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  cabinClass: CabinClass;
  directOnly: boolean;
}

export interface FlexibleSearchQuery extends FlightSearchQuery {
  flexDays: number;
}

export type PriceType = "search" | "confirmed" | "indicative";

export interface Baggage {
  /** Checked baggage allowance in kg. 0 = not included. null = unknown. */
  checkedKg: number | null;
}

export interface FlightOffer {
  id: string;
  provider: string;
  /** True for any data that does not come from a real provider response. */
  isDemo: boolean;

  originAirport: string;
  destinationAirport: string;

  /** ISO-8601 with UTC offset, e.g. 2026-11-12T08:20:00+09:00 */
  departureAt: string;
  arrivalAt: string;
  returnDepartureAt?: string;
  returnArrivalAt?: string;

  airline: string;
  outboundFlightNumber: string;
  inboundFlightNumber?: string;

  /** Max number of stops across both directions. */
  stops: number;
  /** Outbound + inbound flight time in minutes. */
  totalDurationMinutes: number;

  baggage: Baggage;
  cabinClass: CabinClass;

  currency: string;
  /** Price per person, in `currency`. */
  pricePerPerson: number;
  /** Price for all travellers, in `currency`. */
  totalPrice: number;
  adults: number;
  children: number;

  bookingUrl: string;
  fetchedAt: string;
  priceType: PriceType;
  /** 0..1 — how much the displayed price can be trusted. */
  confidence: number;
}

export type ProviderStatus =
  | "connected"
  | "api_required"
  | "partner_required"
  | "unavailable"
  | "temporary_error"
  | "demo";

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  message?: string;
  checkedAt: string;
  latencyMs?: number;
}

export interface TravelDeal {
  id: string;
  provider: string;
  isDemo: boolean;
  title: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  airline?: string;
  price: number;
  originalPrice?: number;
  discountRate?: number;
  bookingUrl: string;
  discoveredAt: string;
  expiresAt?: string;
  rawSource: string;
}
