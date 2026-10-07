import "server-only";
import { envInt } from "@/lib/env";
import { getFlightProviders } from "@/providers/registry";
import type { FlightSearchRequest } from "@/types/domain";
import { getSharedCache, runSearch, type SearchResult } from "./engine";

/** Server-side entry point used by both the API route and Server Components. */
export function searchFlights(request: FlightSearchRequest): Promise<SearchResult> {
  return runSearch(request, {
    providers: getFlightProviders(),
    timeoutMs: envInt("PROVIDER_TIMEOUT_MS", 8000),
    cache: getSharedCache(envInt("SEARCH_CACHE_TTL_SECONDS", 900)),
  });
}
