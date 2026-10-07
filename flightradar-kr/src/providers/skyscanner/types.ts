/**
 * Raw Skyscanner Partners API v3 response shapes (Flights Live Prices).
 * Modelled from the public developer documentation (create/poll, content.results
 * with itineraries/legs/segments/places/carriers/agents). Not yet exercised against a
 * live key; every field is optional so an unexpected payload degrades gracefully.
 */
export interface SkyDateTime {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export interface SkyPrice {
  /** String integer, expressed in `unit` (usually PRICE_UNIT_MILLI = 1/1000). */
  amount?: string;
  unit?: string;
}

export interface SkyPricingItem {
  price?: SkyPrice;
  agentId?: string;
  deepLink?: string;
}

export interface SkyPricingOption {
  price?: SkyPrice;
  /** More than one agent = a "mashup" (separate tickets from different agents). */
  agentIds?: string[];
  items?: SkyPricingItem[];
}

export interface SkyItinerary {
  pricingOptions?: SkyPricingOption[];
  legIds?: string[];
}

export interface SkyLeg {
  originPlaceId?: string;
  destinationPlaceId?: string;
  departureDateTime?: SkyDateTime;
  arrivalDateTime?: SkyDateTime;
  durationInMinutes?: number;
  stopCount?: number;
  marketingCarrierIds?: string[];
  segmentIds?: string[];
}

export interface SkySegment {
  marketingFlightNumber?: string;
  marketingCarrierId?: string;
}

export interface SkyPlace {
  entityId?: string;
  iata?: string;
  name?: string;
  type?: string;
}

export interface SkyCarrier {
  name?: string;
  iata?: string;
  iataCode?: string;
}

export interface SkyAgent {
  name?: string;
  type?: string;
}

export interface SkySearchResponse {
  sessionToken?: string;
  status?: "RESULT_STATUS_COMPLETE" | "RESULT_STATUS_INCOMPLETE" | "RESULT_STATUS_FAILED" | string;
  /** Poll only: REPLACED = take this payload; NOT_MODIFIED = keep what you have. */
  action?: "RESULT_ACTION_REPLACED" | "RESULT_ACTION_NOT_MODIFIED" | string;
  content?: {
    results?: {
      itineraries?: Record<string, SkyItinerary>;
      legs?: Record<string, SkyLeg>;
      segments?: Record<string, SkySegment>;
      places?: Record<string, SkyPlace>;
      carriers?: Record<string, SkyCarrier>;
      agents?: Record<string, SkyAgent>;
    };
  };
}

/** Indicative (cached, approximate) price for one day — used for date discovery. Phase 3. */
export interface IndicativeDayPrice {
  date: string; // YYYY-MM-DD
  minPrice: number;
  currency: string;
  direct: boolean;
}
