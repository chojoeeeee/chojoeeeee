import "server-only";
import { envInt } from "@/lib/env";
import { getSources } from "@/providers/sources";
import type { FlightSearchRequest } from "@/types/domain";
import { getSharedCaches, runSearch, runSource, type EngineDeps, type SearchResult, type SourceResult } from "./engine";

function deps(): EngineDeps {
  return {
    sources: getSources(),
    timeoutMs: envInt("PROVIDER_TIMEOUT_MS", 8000),
    ...getSharedCaches(envInt("SEARCH_CACHE_TTL_SECONDS", 900)),
  };
}

/** The six sources shown to the user, in display order. */
export function listSources() {
  return getSources().map((s) => ({ name: s.name, displayName: s.displayName, checkUrl: s.checkUrl, checkLabel: s.checkLabel }));
}

/** Queries all six sources (used by the full-result API and, later, the scheduler). */
export function searchAll(request: FlightSearchRequest): Promise<SearchResult> {
  return runSearch(request, deps());
}

/** Queries one source (used by the UI so each source's progress can be shown live). */
export async function searchSource(name: string, request: FlightSearchRequest): Promise<SourceResult | undefined> {
  const d = deps();
  const source = d.sources.find((s) => s.name === name);
  return source ? runSource(source, request, d) : undefined;
}
