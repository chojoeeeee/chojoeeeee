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

/** Where the data came from. "demo" is never real market data. */
export type SourceType = "api" | "affiliate" | "public_web" | "demo";

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

  /** Who sells this fare (e.g. the booking agent behind a Skyscanner result). */
  seller?: string;
  bookingUrl: string;
  fetchedAt: string;
  priceType: PriceType;
  sourceType: SourceType;
  /** 0..1 — how much the displayed price can be trusted. */
  confidence: number;
}

export type ProviderStatus =
  | "connected"
  | "api_required"
  | "partner_required"
  | "unavailable"
  | "temporary_error"
  | "manual_check" // automatic lookup not possible/confirmed: user must check the site
  | "demo";

export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  message?: string;
  checkedAt: string;
  latencyMs?: number;
}

/** What a deal provider is asked about; derived from the user's flight search. */
export interface DealQuery {
  origins: string[];
  destinations: string[];
  departureDate: string;
  returnDate?: string;
  /** Free-text keywords (city, country, airport code, month) for providers that search text. */
  keywords: string[];
}

export interface TravelDeal {
  id: string;
  provider: string;
  isDemo: boolean;
  title: string;
  origin?: string;
  destination?: string;
  /** Travel window. For a window deal (e.g. whole November) start..end is the allowed range. */
  travelStartDate?: string;
  travelEndDate?: string;
  airline?: string;
  /** Per person, round trip unless the title says otherwise. */
  price: number;
  currency: string;
  originalPrice?: number;
  discountRate?: number;
  bookingUrl: string;
  publishedAt: string;
  expiresAt?: string;
  rawSource: string;
}
