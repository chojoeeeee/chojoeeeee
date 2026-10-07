import type {
  FlexibleSearchQuery,
  FlightOffer,
  FlightSearchQuery,
  ProviderHealth,
  TravelDeal,
  DealQuery,
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
  getDeals(query: DealQuery, ctx?: SearchContext): Promise<TravelDeal[]>;
  healthCheck(): Promise<ProviderHealth>;
}

/** Thrown by providers that cannot be used yet (missing key / approval). */
export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly status: "api_required" | "partner_required" | "unavailable" | "manual_check",
    message: string,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * One of the six user-facing services. A source is ALWAYS queried on every
 * search, even if it can only answer "manual_check".
 */
export interface SourceProvider {
  readonly name: string;
  readonly displayName: string;
  /** Where the user can check the service by hand (website or app store page). */
  readonly checkUrl: string;
  /** Label for that link, e.g. "사이트에서 직접 확인" / "앱에서 직접 확인". */
  readonly checkLabel: string;
  /** Deep link to the search if the URL scheme is known; otherwise `checkUrl`. */
  directUrl(search: { origin: string; destination: string; departureDate: string; returnDate?: string; adults: number }): string;
  readonly flight?: FlightProvider;
  readonly deal?: DealProvider;
}

/**
 * Placeholder for a provider that can only be queried with browser automation.
 * NOTHING implements this yet and no scraping runs. A browser provider may only be
 * added for a service whose terms and robots policy explicitly allow automated
 * access, and must never bypass CAPTCHA, login, anti-bot or other protections.
 */
export interface BrowserFlightProvider extends FlightProvider {
  readonly mode: "browser";
}
