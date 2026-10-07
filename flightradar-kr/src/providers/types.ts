import type {
  FlexibleSearchQuery,
  FlightOffer,
  FlightSearchQuery,
  ProviderHealth,
  TravelDeal,
  DealQuery,
} from "@/types/domain";

/** Why a provider is being called. Background calls must respect `ProviderSchedulePolicy`. */
export type SearchTrigger = "user" | "background";

export interface SearchContext {
  signal?: AbortSignal;
  trigger?: SearchTrigger;
}

/**
 * What a provider's terms / partner contract allow. Managed per provider,
 * independently. The default (when a provider declares nothing) is the
 * restrictive one: user-initiated only, no background polling.
 */
export interface ProviderSchedulePolicy {
  /** May be called when a user explicitly searches. */
  userInitiatedSearch: boolean;
  /** May be called by a scheduler/cron without a user action. */
  backgroundPolling: boolean;
  /** Minimum minutes between background calls for the same query (when background is allowed). */
  minimumInterval?: number;
  /** "confirmed" = backed by the provider's published terms; "unverified" = not yet checked. */
  policyStatus: "confirmed" | "unverified";
  notes?: string;
}

export const DEFAULT_SCHEDULE_POLICY: ProviderSchedulePolicy = {
  userInitiatedSearch: true,
  backgroundPolling: false,
  policyStatus: "unverified",
  notes: "정책 미선언 — 보수적 기본값(사용자 검색만, 백그라운드 금지)",
};

export interface FlightProvider {
  readonly name: string;
  /** Human readable name for the UI. */
  readonly displayName: string;
  isEnabled(): boolean;
  /** True when the provider currently returns demo data. */
  isDemo(): boolean;
  /** Terms-based call policy. Optional; absent = DEFAULT_SCHEDULE_POLICY. */
  schedulePolicy?(): ProviderSchedulePolicy;
  searchFlights(query: FlightSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]>;
  searchFlexibleDates?(query: FlexibleSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface DealProvider {
  readonly name: string;
  readonly displayName: string;
  isEnabled(): boolean;
  schedulePolicy?(): ProviderSchedulePolicy;
  getDeals(query: DealQuery, ctx?: SearchContext): Promise<TravelDeal[]>;
  healthCheck(): Promise<ProviderHealth>;
}

/** Thrown by providers that cannot be used yet (missing key / approval). */
/** Thrown when a page/API structure has not been verified, so no parser may guess. */
export class StructureUnverifiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructureUnverifiedError";
  }
}

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
/** Which area of the result screen a source belongs to. */
export type SourceRole = "flight" | "deal";

export interface SourceProvider {
  readonly name: string;
  readonly displayName: string;
  /** "flight" = date-searchable prices (real schedule comparison); "deal" = curated/promotional deals. */
  readonly role: SourceRole;
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
