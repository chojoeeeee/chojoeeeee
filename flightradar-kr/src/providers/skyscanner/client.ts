import "server-only";
import type { CabinClass, FlightSearchQuery } from "@/types/domain";
import type { SkySearchResponse } from "./types";

const BASE = "https://partners.api.skyscanner.net/apiservices/v3/flights/live/search";

const CABIN: Record<CabinClass, string> = {
  economy: "CABIN_CLASS_ECONOMY",
  premium_economy: "CABIN_CLASS_PREMIUM_ECONOMY",
  business: "CABIN_CLASS_BUSINESS",
  first: "CABIN_CLASS_FIRST",
};

function leg(origin: string, destination: string, date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { originPlaceId: { iata: origin }, destinationPlaceId: { iata: destination }, date: { year, month, day } };
}

export interface SkyscannerClientConfig {
  apiKey: string;
  market: string;
  locale: string;
  maxPolls?: number;
  pollDelayMs?: number;
}

async function post(url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<SkySearchResponse> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Skyscanner HTTP ${res.status}`);
  return (await res.json()) as SkySearchResponse;
}

/** Live Prices: create a session, then poll until complete (bounded). */
export async function searchLive(
  cfg: SkyscannerClientConfig,
  query: FlightSearchQuery,
  signal?: AbortSignal,
): Promise<SkySearchResponse> {
  const queryLegs = [leg(query.origin, query.destination, query.departureDate)];
  if (query.returnDate) queryLegs.push(leg(query.destination, query.origin, query.returnDate));

  let res = await post(
    `${BASE}/create`,
    cfg.apiKey,
    {
      query: {
        market: cfg.market,
        locale: cfg.locale,
        currency: query.currency,
        queryLegs,
        adults: query.adults,
        childrenAges: Array.from({ length: query.children }, () => 8),
        cabinClass: CABIN[query.cabinClass],
        nearbyAirports: false,
      },
    },
    signal,
  );

  const maxPolls = cfg.maxPolls ?? 3;
  for (let i = 0; i < maxPolls && res.status === "RESULT_STATUS_INCOMPLETE" && res.sessionToken; i++) {
    await new Promise((r) => setTimeout(r, cfg.pollDelayMs ?? 1000));
    res = await post(`${BASE}/poll/${res.sessionToken}`, cfg.apiKey, {}, signal);
  }
  if (res.status === "RESULT_STATUS_FAILED") throw new Error("Skyscanner search failed");
  return res;
}
