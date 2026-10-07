import { dealKeywords } from "@/features/deal-engine/related";
import { logProviderRequest, sanitizeError } from "@/lib/logger";
import { DEFAULT_SCHEDULE_POLICY, ProviderUnavailableError, StructureUnverifiedError, type ProviderSchedulePolicy, type SearchTrigger, type SourceProvider } from "@/providers/types";
import type { DealQuery, FlightOffer, FlightSearchQuery, FlightSearchRequest, TravelDeal } from "@/types/domain";
import { createMemoryCache, type SearchCache } from "./cache";
import { searchHash } from "./hash";
import { normalizeOffers, type FxRates } from "./normalize";
import { assembleResult, makeRun, type PartOutcome, type SearchResult, type SourceResult, type SourceRun, type SourceStatus } from "./result";

export type { SearchResult, SourceResult, SourceRow, SourceRun, SourceStatus } from "./result";

export interface EngineDeps {
  sources: SourceProvider[];
  /**
   * Who is asking. Defaults to "user" (a person pressed search). A scheduler MUST pass
   * "background": providers whose policy forbids background polling are then not called.
   */
  trigger?: SearchTrigger;
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
  /** Set when the call was skipped because the provider's policy forbids it for this trigger. */
  skippedReason?: string;
  /** Set only if the whole part failed. */
  failure?: unknown;
  attempted: boolean;
  cached: boolean;
}

const NOT_ATTEMPTED = { items: [], attempted: false, cached: false } as const;

/** Returns a skip reason if `policy` forbids this trigger. */
export function policyViolation(policy: ProviderSchedulePolicy | undefined, trigger: SearchTrigger): string | undefined {
  const p = policy ?? DEFAULT_SCHEDULE_POLICY;
  if (trigger === "background" && !p.backgroundPolling) return p.notes ?? "이 서비스의 정책상 자동(백그라운드) 조회가 허용되지 않습니다.";
  return undefined;
}

function failureStatus(reason: unknown): SourceStatus {
  if (reason instanceof TimeoutError) return "timeout";
  if (reason instanceof ProviderUnavailableError) return reason.status;
  if (reason instanceof StructureUnverifiedError) return "manual_check";
  return "error";
}

function failureReason(reason: unknown): string {
  if (reason instanceof TimeoutError) return "응답 시간이 초과되었습니다.";
  if (reason instanceof ProviderUnavailableError || reason instanceof StructureUnverifiedError) return reason.message;
  return "일시적인 오류로 조회하지 못했습니다.";
}

async function flightPart(source: SourceProvider, queries: FlightSearchQuery[], deps: EngineDeps): Promise<Part<FlightOffer>> {
  const provider = source.flight;
  if (!provider) return { ...NOT_ATTEMPTED, items: [] };
  const trigger = deps.trigger ?? "user";
  const skippedReason = policyViolation(provider.schedulePolicy?.(), trigger);
  if (skippedReason) return { ...NOT_ATTEMPTED, items: [], skippedReason };
  let cachedAll = true;
  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const key = `f:${searchHash(q, provider.name)}`;
      const hit = deps.cache?.get(key);
      if (hit) return hit;
      cachedAll = false;
      const offers = await withTimeout((signal) => provider.searchFlights(q, { signal, trigger }), deps.timeoutMs);
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
  const trigger = deps.trigger ?? "user";
  const skippedReason = policyViolation(provider.schedulePolicy?.(), trigger);
  if (skippedReason) return { ...NOT_ATTEMPTED, items: [], skippedReason };
  const query = toDealQuery(req);
  const key = `d:${provider.name}:${JSON.stringify(query)}`;
  const hit = deps.dealCache?.get(key);
  if (hit) return { items: hit, attempted: true, cached: true };
  try {
    const items = await withTimeout((signal) => provider.getDeals(query, { signal, trigger }), deps.timeoutMs);
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
  if (parts.length === 0) {
    const skipped = f.skippedReason ?? d.skippedReason;
    if (skipped) return { status: "policy_skipped", reason: `백그라운드 조회 건너뜀: ${skipped}` };
  }
  if (parts.some((p) => p.failure === undefined)) return { status: "no_results", reason: "조회는 성공했지만 현재 조건에 맞는 결과가 없습니다." };
  const failures = parts.map((p) => p.failure);
  // Technical failures are more informative than "not connectable".
  const technical = failures.find((x) => !(x instanceof ProviderUnavailableError) && !(x instanceof StructureUnverifiedError));
  const chosen = technical ?? failures[0];
  if (chosen === undefined) return { status: "unavailable", reason: "조회 가능한 방식이 등록되어 있지 않습니다." };
  return { status: failureStatus(chosen), reason: failureReason(chosen) };
}

function makeRunFor(source: SourceProvider, req: FlightSearchRequest, partial: Partial<SourceRun>): SourceRun {
  const directUrl = source.directUrl({ origin: req.origins[0] ?? "", destination: req.destinations[0] ?? "", departureDate: req.departureDate, returnDate: req.returnDate, adults: req.adults });
  return makeRun({ name: source.name, displayName: source.displayName, role: source.role, checkUrl: source.checkUrl, checkLabel: source.checkLabel }, directUrl, partial);
}

/** Queries ONE source (flights + deals in parallel). Never throws. */
export async function runSource(source: SourceProvider, request: FlightSearchRequest, deps: EngineDeps): Promise<SourceResult> {
  const lastAttemptAt = (deps.now?.() ?? new Date()).toISOString();
  const started = Date.now();
  try {
    const [rawFlights, d] = await Promise.all([flightPart(source, expandQueries(request), deps), dealPart(source, request, deps)]);
    // Convert currencies on the server, where the FX rates live. Offers that cannot be converted are dropped, not guessed.
    const f: Part<FlightOffer> = { ...rawFlights, items: normalizeOffers(rawFlights.items, deps.fxRates).offers };
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
    const outcome = (p: Part<unknown>): PartOutcome | undefined =>
      p.attempted || p.skippedReason ? { attempted: p.attempted, skipped: Boolean(p.skippedReason), failed: p.failure !== undefined, count: p.items.length } : undefined;
    return {
      run: makeRunFor(source, request, {
        status,
        reason,
        isDemo,
        parts: { flight: source.flight ? outcome(f) : undefined, deal: source.deal ? outcome(d) : undefined },
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

/** Queries ALL given sources in parallel and returns each one's raw result. One failing source never affects the others. */
export async function runSources(request: FlightSearchRequest, deps: EngineDeps): Promise<SourceResult[]> {
  const settled = await Promise.allSettled(deps.sources.map((s) => runSource(s, request, deps)));
  return settled.map((s, i): SourceResult => {
    if (s.status === "fulfilled") return s.value;
    return { run: makeRunFor(deps.sources[i]!, request, { status: "error", reason: "일시적인 오류로 조회하지 못했습니다." }), offers: [], deals: [] };
  });
}

/** Queries ALL sources in parallel and assembles the comparison shown to the user. */
export async function runSearch(request: FlightSearchRequest, deps: EngineDeps): Promise<SearchResult> {
  return assembleResult(request, await runSources(request, deps), { fxRates: deps.fxRates, now: deps.now });
}

let sharedCache: SearchCache<FlightOffer[]> | undefined;
let sharedDealCache: SearchCache<TravelDeal[]> | undefined;
export function getSharedCaches(ttlSeconds: number) {
  sharedCache ??= createMemoryCache<FlightOffer[]>(ttlSeconds * 1000);
  sharedDealCache ??= createMemoryCache<TravelDeal[]>(ttlSeconds * 1000);
  return { cache: sharedCache, dealCache: sharedDealCache };
}
