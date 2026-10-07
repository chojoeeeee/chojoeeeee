import type { CabinClass, FlightSearchQuery } from "@/types/domain";
import { ProviderUnavailableError } from "../types";
import type { SkySearchResponse } from "./types";

const BASE = "https://partners.api.skyscanner.net/apiservices/v3/flights/live/search";

const CABIN: Record<CabinClass, string> = {
  economy: "CABIN_CLASS_ECONOMY",
  premium_economy: "CABIN_CLASS_PREMIUM_ECONOMY",
  business: "CABIN_CLASS_BUSINESS",
  first: "CABIN_CLASS_FIRST",
};

export interface SkyscannerClientConfig {
  apiKey: string;
  market: string;
  locale: string;
  /** Upper bound on poll calls after `create` (partial results are returned if still incomplete). */
  maxPolls?: number;
  pollDelayMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

function leg(origin: string, destination: string, date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { originPlaceId: { iata: origin }, destinationPlaceId: { iata: destination }, date: { year, month, day } };
}

export function buildCreateBody(cfg: Pick<SkyscannerClientConfig, "market" | "locale">, query: FlightSearchQuery) {
  const queryLegs = [leg(query.origin, query.destination, query.departureDate)];
  if (query.returnDate) queryLegs.push(leg(query.destination, query.origin, query.returnDate));
  return {
    query: {
      market: cfg.market,
      locale: cfg.locale,
      currency: query.currency,
      queryLegs,
      adults: query.adults,
      // Children's ages are not collected yet; 8 is a neutral placeholder for pricing.
      childrenAges: Array.from({ length: query.children }, () => 8),
      cabinClass: CABIN[query.cabinClass],
      nearbyAirports: false,
    },
  };
}

async function post(cfg: SkyscannerClientConfig, url: string, body: unknown, signal?: AbortSignal): Promise<SkySearchResponse> {
  const res = await (cfg.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "x-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  // Never include the response body or headers in errors (they may echo credentials).
  if (res.status === 401 || res.status === 403) {
    throw new ProviderUnavailableError("skyscanner", "api_required", `Skyscanner가 API Key를 거부했습니다 (HTTP ${res.status}). 키 권한과 승인 상태를 확인하세요.`);
  }
  if (res.status === 429) throw new Error("Skyscanner rate limit exceeded (HTTP 429)");
  if (!res.ok) throw new Error(`Skyscanner HTTP ${res.status}`);
  return (await res.json()) as SkySearchResponse;
}

/**
 * Live Prices: POST /create, then POST /poll/{sessionToken} until
 * RESULT_STATUS_COMPLETE (bounded). `create` only returns a cached partial
 * subset, so polling is required for complete results.
 */
export async function searchLive(cfg: SkyscannerClientConfig, query: FlightSearchQuery, signal?: AbortSignal): Promise<SkySearchResponse> {
  const created = await post(cfg, `${BASE}/create`, buildCreateBody(cfg, query), signal);
  let results = created.content?.results;
  let last = created;

  const maxPolls = cfg.maxPolls ?? 6;
  const sleep = cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < maxPolls && last.status === "RESULT_STATUS_INCOMPLETE" && last.sessionToken; i++) {
    await sleep(cfg.pollDelayMs ?? 1000);
    if (signal?.aborted) break;
    last = await post(cfg, `${BASE}/poll/${last.sessionToken}`, {}, signal);
    // NOT_MODIFIED: keep what we already have; otherwise take the new payload.
    if (last.action !== "RESULT_ACTION_NOT_MODIFIED" && last.content?.results) results = last.content.results;
  }
  if (last.status === "RESULT_STATUS_FAILED") throw new Error("Skyscanner search failed");
  return { ...last, content: { results } };
}
