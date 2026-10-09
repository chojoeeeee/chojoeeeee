import { relatedDeals, savingsTip, type RelatedDeal, type SavingsTip } from "@/features/deal-engine/related";
import type { SourceRole } from "@/providers/types";
import type { FlightOffer, FlightSearchRequest, TravelDeal } from "@/types/domain";
import { groupOffers, providerPrices, recommend, type FlightGroup, type ProviderPrice, type Recommendations } from "./compare";
import { normalizeOffers, type FxRates } from "./normalize";

// Client-safe (no server-only / node imports): the browser assembles the final
// comparison from the per-source results it receives.

/**
 * Per-source outcome. A source is never dropped from the result — every one of
 * the registered sources gets exactly one status.
 */
export type SourceStatus =
  | "ok" // flight prices found
  | "deals_only" // no flight prices, but related deals found
  | "no_results" // queried successfully, nothing found
  | "manual_check" // automatic lookup not possible → user checks by hand
  | "api_required"
  | "partner_required"
  | "unavailable"
  | "timeout"
  | "error"
  | "policy_skipped"; // a background call the provider's terms do not allow

/** What happened to one part (flight search / deal feed) of a source in a run. */
export interface PartOutcome {
  attempted: boolean;
  /** Not called because the provider's schedule policy forbids this trigger. */
  skipped: boolean;
  failed: boolean;
  count: number;
}

export interface SourceRun {
  provider: string;
  displayName: string;
  /** "flight" = real-schedule price comparison; "deal" = related deals. */
  role: SourceRole;
  checkUrl: string;
  checkLabel: string;
  directUrl: string;
  status: SourceStatus;
  /** Human-readable explanation for non-ok statuses. */
  reason?: string;
  isDemo: boolean;
  /** Demo data left out of the comparison because real data exists. */
  excluded: boolean;
  flightCount: number;
  dealCount: number;
  elapsedMs: number;
  cached: boolean;
  /** ISO time the attempt started. */
  lastAttemptAt: string;
  /** Per-part outcome (undefined = the source has no such part). */
  parts?: { flight?: PartOutcome; deal?: PartOutcome };
}

/** JSON-serialisable result of querying one source (what /api/search/source returns). */
export interface SourceResult {
  run: SourceRun;
  offers: FlightOffer[];
  deals: TravelDeal[];
}

export interface SourceRow extends SourceRun {
  bestOffer?: FlightOffer;
  bestDeal?: TravelDeal;
  /** This source's deals that match the searched route and similar dates. */
  related: RelatedDeal[];
  /** 1-based rank among sources with comparable prices. */
  rank?: number;
  /** KRW per person above the cheapest source (0 for the cheapest). */
  diffFromBest?: number;
}

export interface SearchResult {
  request: FlightSearchRequest;
  sources: SourceRow[];
  groups: FlightGroup[];
  providerPrices: ProviderPrice[];
  recommendations: Recommendations;
  relatedDeals: RelatedDeal[];
  savingsTip?: SavingsTip;
  /** confirmed = sources that returned prices or deals (and are shown in comparison); live = those that are not DEMO. */
  summary: { total: number; confirmed: number; live: number };
  /** "demo" = every displayed number is DEMO DATA; "none" = nothing to display. */
  dataMode: "live" | "demo" | "none";
  generatedAt: string;
}

/** The part of a source the UI needs even when the source could not be queried. */
export interface SourceInfo {
  name: string;
  displayName: string;
  role: SourceRole;
  checkUrl: string;
  checkLabel: string;
}

export function makeRun(info: SourceInfo, directUrl: string, partial: Partial<SourceRun> = {}): SourceRun {
  return {
    provider: info.name,
    displayName: info.displayName,
    role: info.role,
    checkUrl: info.checkUrl,
    checkLabel: info.checkLabel,
    directUrl,
    status: "error",
    isDemo: false,
    excluded: false,
    flightCount: 0,
    dealCount: 0,
    elapsedMs: 0,
    cached: false,
    lastAttemptAt: new Date().toISOString(),
    ...partial,
  };
}

/** A source whose request itself failed (network, 5xx…). It is still shown. */
export function failedSourceResult(info: SourceInfo, reason: string): SourceResult {
  return { run: makeRun(info, info.checkUrl, { status: "error", reason }), offers: [], deals: [] };
}

const CONFIRMED: SourceStatus[] = ["ok", "deals_only"];

/** Pure: combine per-source results into the comparison shown to the user. */
export function assembleResult(
  request: FlightSearchRequest,
  results: SourceResult[],
  opts: { fxRates?: FxRates; now?: () => Date } = {},
): SearchResult {
  const { offers: normalized } = normalizeOffers(
    results.flatMap((r) => r.offers),
    opts.fxRates,
  );

  // Never mix real and demo data: if anything real exists, demo is left out.
  const hasReal = normalized.some((o) => !o.isDemo) || results.some((r) => r.deals.some((x) => !x.isDemo));
  const shownOffers = hasReal ? normalized.filter((o) => !o.isDemo) : normalized;
  const shownDeals = results.flatMap((r) => r.deals).filter((x) => !hasReal || !x.isDemo);

  const prices = providerPrices(shownOffers);
  const best = prices[0]?.offer.pricePerPerson;
  const rankOf = new Map(prices.map((p) => [p.provider, p]));

  const sources: SourceRow[] = results.map(({ run, deals: ownDeals }) => {
    const excluded = hasReal && run.isDemo;
    const price = excluded ? undefined : rankOf.get(run.provider);
    // Attribute deals to the source whose response contained them.
    const deals = excluded ? [] : ownDeals.filter((x) => !hasReal || !x.isDemo).sort((a, b) => a.price - b.price);
    return {
      ...run,
      excluded,
      reason: excluded ? "데모 데이터라서 실제 가격 비교에서 제외했습니다." : run.reason,
      bestOffer: price?.offer,
      bestDeal: deals[0],
      related: [],
      rank: price?.rank,
      diffFromBest: price && best !== undefined ? price.offer.pricePerPerson - best : undefined,
    };
  });

  // Deals-only status can lose its deals to the demo filter.
  for (const s of sources) {
    if (s.status === "ok" && !s.bestOffer && !s.excluded) s.status = s.bestDeal ? "deals_only" : "no_results";
  }

  const groups = groupOffers(shownOffers);
  const related = relatedDeals(shownDeals, request);
  for (const row of sources) {
    const own = new Set(results.find((r) => r.run.provider === row.provider)?.deals.map((d) => d.id));
    row.related = row.excluded ? [] : related.filter((r) => own.has(r.deal.id));
  }
  return {
    request,
    sources,
    groups,
    providerPrices: prices,
    recommendations: recommend(groups),
    relatedDeals: related,
    savingsTip: savingsTip(related, best),
    summary: {
      total: sources.length,
      confirmed: sources.filter((s) => !s.excluded && CONFIRMED.includes(s.status)).length,
      live: sources.filter((s) => !s.excluded && !s.isDemo && CONFIRMED.includes(s.status)).length,
    },
    dataMode: hasReal ? "live" : shownOffers.length > 0 || shownDeals.length > 0 ? "demo" : "none",
    generatedAt: (opts.now?.() ?? new Date()).toISOString(),
  };
}

