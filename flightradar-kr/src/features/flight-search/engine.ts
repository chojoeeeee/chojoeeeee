import type { FlightOffer, FlightSearchQuery, FlightSearchRequest } from "@/types/domain";
import { logProviderRequest, sanitizeError } from "@/lib/logger";
import { ProviderUnavailableError, type FlightProvider } from "@/providers/types";
import { createMemoryCache, type SearchCache } from "./cache";
import { groupOffers, providerPrices, recommend, type FlightGroup, type ProviderPrice, type Recommendations } from "./compare";
import { searchHash } from "./hash";
import { normalizeOffers, type FxRates } from "./normalize";

export type RunStatus = "ok" | "error" | "timeout" | "unavailable";

export interface ProviderRun {
  provider: string;
  displayName: string;
  status: RunStatus;
  isDemo: boolean;
  /** Demo offers are excluded from the comparison when real offers exist. */
  excluded: boolean;
  offerCount: number;
  elapsedMs: number;
  cached: boolean;
  error?: string;
}

export interface SearchResult {
  request: FlightSearchRequest;
  groups: FlightGroup[];
  providerPrices: ProviderPrice[];
  recommendations: Recommendations;
  providers: ProviderRun[];
  summary: { total: number; succeeded: number; failed: number };
  /** "demo" = every displayed offer is DEMO DATA. */
  dataMode: "live" | "demo";
  generatedAt: string;
}

export interface EngineDeps {
  providers: FlightProvider[];
  timeoutMs: number;
  cache?: SearchCache<FlightOffer[]>;
  fxRates?: FxRates;
  now?: () => Date;
}

export function expandQueries(req: FlightSearchRequest): FlightSearchQuery[] {
  const out: FlightSearchQuery[] = [];
  for (const origin of req.origins) {
    for (const destination of req.destinations) {
      if (origin === destination) continue;
      out.push({
        origin,
        destination,
        departureDate: req.departureDate,
        returnDate: req.returnDate,
        adults: req.adults,
        children: req.children,
        cabinClass: req.cabinClass,
        directOnly: req.directOnly,
        currency: "KRW",
      });
    }
  }
  return out;
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timeout after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([run(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** One provider across every airport pair. Never throws. */
async function runProvider(
  provider: FlightProvider,
  queries: FlightSearchQuery[],
  deps: EngineDeps,
): Promise<{ run: ProviderRun; offers: FlightOffer[] }> {
  const started = Date.now();
  const requestedAt = new Date().toISOString();
  let cachedAll = true;

  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const key = searchHash(q, provider.name);
      const hit = deps.cache?.get(key);
      if (hit) return hit;
      cachedAll = false;
      const offers = await withTimeout((signal) => provider.searchFlights(q, { signal }), deps.timeoutMs);
      deps.cache?.set(key, offers);
      return offers;
    }),
  );

  const offers = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
  const elapsedMs = Date.now() - started;

  let status: RunStatus = "ok";
  let error: string | undefined;
  // The provider counts as failed only if *every* airport pair failed.
  if (failures.length === settled.length && failures.length > 0) {
    const reason = failures[0]!.reason;
    status = reason instanceof TimeoutError ? "timeout" : reason instanceof ProviderUnavailableError ? "unavailable" : "error";
    error = sanitizeError(reason);
  }

  logProviderRequest({ provider: provider.name, requestedAt, status, elapsedMs, resultCount: offers.length, error });

  return {
    run: {
      provider: provider.name,
      displayName: provider.displayName,
      status,
      isDemo: provider.isDemo(),
      excluded: false,
      offerCount: offers.length,
      elapsedMs,
      cached: cachedAll && settled.length > 0,
      error,
    },
    offers,
  };
}

export async function runSearch(request: FlightSearchRequest, deps: EngineDeps): Promise<SearchResult> {
  const queries = expandQueries(request);

  // allSettled again as a last line of defence: a bug inside runProvider must not fail the whole search.
  const settled = await Promise.allSettled(deps.providers.map((p) => runProvider(p, queries, deps)));

  const runs: ProviderRun[] = [];
  const all: FlightOffer[] = [];
  settled.forEach((s, i) => {
    const p = deps.providers[i]!;
    if (s.status === "fulfilled") {
      runs.push(s.value.run);
      all.push(...s.value.offers);
    } else {
      runs.push({ provider: p.name, displayName: p.displayName, status: "error", isDemo: p.isDemo(), excluded: false, offerCount: 0, elapsedMs: 0, cached: false, error: sanitizeError(s.reason) });
    }
  });

  const { offers: normalized } = normalizeOffers(all, deps.fxRates);

  // Never mix real and demo data: if any real offer exists, demo offers are left out.
  const hasReal = normalized.some((o) => !o.isDemo);
  const shown = hasReal ? normalized.filter((o) => !o.isDemo) : normalized;
  if (hasReal) for (const r of runs) r.excluded = r.isDemo;

  const groups = groupOffers(shown);
  const counted = runs.filter((r) => !r.excluded);
  return {
    request,
    groups,
    providerPrices: providerPrices(shown),
    recommendations: recommend(groups),
    providers: runs,
    summary: {
      total: counted.length,
      succeeded: counted.filter((r) => r.status === "ok").length,
      failed: counted.filter((r) => r.status !== "ok").length,
    },
    dataMode: hasReal ? "live" : "demo",
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
}

let sharedCache: SearchCache<FlightOffer[]> | undefined;
export function getSharedCache(ttlSeconds: number): SearchCache<FlightOffer[]> {
  sharedCache ??= createMemoryCache<FlightOffer[]>(ttlSeconds * 1000);
  return sharedCache;
}
