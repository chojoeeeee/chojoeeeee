import type {
  FlexibleSearchQuery,
  FlightOffer,
  FlightSearchQuery,
  ProviderHealth,
  TravelDeal,
} from "@/types/domain";

export interface SearchContext {
  signal?: AbortSignal;
}

export interface FlightProvider {
  readonly name: string;
  /** Human readable name for the UI. */
  readonly displayName: string;
  isEnabled(): boolean;
  /** True when the provider currently returns demo data. */
  isDemo(): boolean;
  searchFlights(query: FlightSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]>;
  searchFlexibleDates?(query: FlexibleSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface DealProvider {
  readonly name: string;
  readonly displayName: string;
  isEnabled(): boolean;
  getDeals(): Promise<TravelDeal[]>;
  healthCheck(): Promise<ProviderHealth>;
}

/** Thrown by providers that cannot be used yet (missing key / approval). */
export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly status: "api_required" | "partner_required" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
