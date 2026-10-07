/**
 * Raw Skyscanner Partners API v3 response shapes (Flights Live Prices).
 * NOTE: modelled from the public API documentation; NOT yet verified against
 * a live response because no API key is available. Every field is optional on
 * purpose so that an unexpected payload degrades gracefully in the mapper.
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
  deepLink?: string;
  agentId?: string;
}

export interface SkyPricingOption {
  price?: SkyPrice;
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
  iata?: string;
  name?: string;
}

export interface SkyCarrier {
  name?: string;
  iataCode?: string;
}

export interface SkySearchResponse {
  sessionToken?: string;
  status?: "RESULT_STATUS_COMPLETE" | "RESULT_STATUS_INCOMPLETE" | "RESULT_STATUS_FAILED" | string;
  content?: {
    results?: {
      itineraries?: Record<string, SkyItinerary>;
      legs?: Record<string, SkyLeg>;
      segments?: Record<string, SkySegment>;
      places?: Record<string, SkyPlace>;
      carriers?: Record<string, SkyCarrier>;
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
