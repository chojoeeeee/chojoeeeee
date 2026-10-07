import { dealKeywords } from "@/features/deal-engine/related";
import { logProviderRequest, sanitizeError } from "@/lib/logger";
import { ProviderUnavailableError, type SourceProvider } from "@/providers/types";
import type { DealQuery, FlightOffer, FlightSearchQuery, FlightSearchRequest, TravelDeal } from "@/types/domain";
import { createMemoryCache, type SearchCache } from "./cache";
import { searchHash } from "./hash";
import type { FxRates } from "./normalize";
import { assembleResult, makeRun, type SearchResult, type SourceResult, type SourceRun, type SourceStatus } from "./result";

export type { SearchResult, SourceResult, SourceRow, SourceRun, SourceStatus } from "./result";

export interface EngineDeps {
  sources: SourceProvider[];
  timeoutMs: number;
  cache?: SearchCache<FlightOffer[]>;
  dealCache?: SearchCache<TravelDeal[]>;
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

export function toDealQuery(req: FlightSearchRequest): DealQuery {
  return { origins: req.origins, destinations: req.destinations, departureDate: req.departureDate, returnDate: req.returnDate, keywords: dealKeywords(req) };
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

interface Part<T> {
  items: T[];
  /** Set only if the whole part failed. */
  failure?: unknown;
  attempted: boolean;
  cached: boolean;
}

const NOT_ATTEMPTED = { items: [], attempted: false, cached: false } as const;

function failureStatus(reason: unknown): SourceStatus {
  if (reason instanceof TimeoutError) return "timeout";
  if (reason instanceof ProviderUnavailableError) return reason.status;
  return "error";
}

function failureReason(reason: unknown): string {
  if (reason instanceof TimeoutError) return "응답 시간이 초과되었습니다.";
  if (reason instanceof ProviderUnavailableError) return reason.message;
  return "일시적인 오류로 조회하지 못했습니다.";
}

async function flightPart(source: SourceProvider, queries: FlightSearchQuery[], deps: EngineDeps): Promise<Part<FlightOffer>> {
  const provider = source.flight;
  if (!provider) return { ...NOT_ATTEMPTED, items: [] };
  let cachedAll = true;
  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const key = `f:${searchHash(q, provider.name)}`;
      const hit = deps.cache?.get(key);
      if (hit) return hit;
      cachedAll = false;
      const offers = await withTimeout((signal) => provider.searchFlights(q, { signal }), deps.timeoutMs);
      deps.cache?.set(key, offers);
      return offers;
    }),
  );
  const items = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
  // Failed only if EVERY airport pair failed.
  const failure = failures.length === settled.length && failures.length > 0 ? failures[0]!.reason : undefined;
  return { items, failure, attempted: true, cached: cachedAll && settled.length > 0 };
}

async function dealPart(source: SourceProvider, req: FlightSearchRequest, deps: EngineDeps): Promise<Part<TravelDeal>> {
  const provider = source.deal;
  if (!provider) return { ...NOT_ATTEMPTED, items: [] };
  const query = toDealQuery(req);
  const key = `d:${provider.name}:${JSON.stringify(query)}`;
  const hit = deps.dealCache?.get(key);
  if (hit) return { items: hit, attempted: true, cached: true };
  try {
    const items = await withTimeout((signal) => provider.getDeals(query, { signal }), deps.timeoutMs);
    deps.dealCache?.set(key, items);
    return { items, attempted: true, cached: false };
  } catch (failure) {
    return { items: [], failure, attempted: true, cached: false };
  }
}

function resolveStatus(f: Part<FlightOffer>, d: Part<TravelDeal>): { status: SourceStatus; reason?: string } {
  if (f.items.length > 0) return { status: "ok" };
  if (d.items.length > 0) return { status: "deals_only" };
  const parts = [f, d].filter((p) => p.attempted);
  if (parts.some((p) => p.failure === undefined)) return { status: "no_results", reason: "조회는 성공했지만 현재 조건에 맞는 결과가 없습니다." };
  const failures = parts.map((p) => p.failure);
  // Technical failures are more informative than "not connectable".
  const technical = failures.find((x) => !(x instanceof ProviderUnavailableError));
  const chosen = technical ?? failures[0];
  if (chosen === undefined) return { status: "unavailable", reason: "조회 가능한 방식이 등록되어 있지 않습니다." };
  return { status: failureStatus(chosen), reason: failureReason(chosen) };
}

function makeRunFor(source: SourceProvider, req: FlightSearchRequest, partial: Partial<SourceRun>): SourceRun {
  const directUrl = source.directUrl({ origin: req.origins[0] ?? "", destination: req.destinations[0] ?? "", departureDate: req.departureDate, returnDate: req.returnDate, adults: req.adults });
  return makeRun({ name: source.name, displayName: source.displayName, checkUrl: source.checkUrl, checkLabel: source.checkLabel }, directUrl, partial);
}

/** Queries ONE source (flights + deals in parallel). Never throws. */
export async function runSource(source: SourceProvider, request: FlightSearchRequest, deps: EngineDeps): Promise<SourceResult> {
  const lastAttemptAt = (deps.now?.() ?? new Date()).toISOString();
  const started = Date.now();
  try {
    const [f, d] = await Promise.all([flightPart(source, expandQueries(request), deps), dealPart(source, request, deps)]);
    const { status, reason } = resolveStatus(f, d);
    const elapsedMs = Date.now() - started;
    const failure = f.failure ?? d.failure;
    logProviderRequest({
      provider: source.name,
      requestedAt: lastAttemptAt,
      status: status === "ok" || status === "deals_only" || status === "no_results" ? "ok" : status === "timeout" ? "timeout" : status === "error" ? "error" : "unavailable",
      elapsedMs,
      resultCount: f.items.length + d.items.length,
      error: failure ? sanitizeError(failure) : undefined,
    });
    // Demo-ness is a property of the data actually returned, not of the adapter.
    const isDemo = f.items.some((o) => o.isDemo) || d.items.some((x) => x.isDemo);
    return {
      run: makeRunFor(source, request, {
        status,
        reason,
        isDemo,
        flightCount: f.items.length,
        dealCount: d.items.length,
        elapsedMs,
        cached: (f.attempted ? f.cached : true) && (d.attempted ? d.cached : true) && (f.attempted || d.attempted),
        lastAttemptAt,
      }),
      offers: f.items,
      deals: d.items,
    };
  } catch {
    return { run: makeRunFor(source, request, { status: "error", reason: "일시적인 오류로 조회하지 못했습니다.", elapsedMs: Date.now() - started, lastAttemptAt }), offers: [], deals: [] };
  }
}

/** Queries ALL sources in parallel. One failing source never affects the others. */
export async function runSearch(request: FlightSearchRequest, deps: EngineDeps): Promise<SearchResult> {
  const settled = await Promise.allSettled(deps.sources.map((s) => runSource(s, request, deps)));
  const results = settled.map((s, i): SourceResult => {
    if (s.status === "fulfilled") return s.value;
    return { run: makeRunFor(deps.sources[i]!, request, { status: "error", reason: "일시적인 오류로 조회하지 못했습니다." }), offers: [], deals: [] };
  });
  return assembleResult(request, results, { fxRates: deps.fxRates, now: deps.now });
}

let sharedCache: SearchCache<FlightOffer[]> | undefined;
let sharedDealCache: SearchCache<TravelDeal[]> | undefined;
export function getSharedCaches(ttlSeconds: number) {
  sharedCache ??= createMemoryCache<FlightOffer[]>(ttlSeconds * 1000);
  sharedDealCache ??= createMemoryCache<TravelDeal[]>(ttlSeconds * 1000);
  return { cache: sharedCache, dealCache: sharedDealCache };
}
