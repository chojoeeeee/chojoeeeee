import { randomUUID } from "node:crypto";
import { planBackgroundRefresh, type PlannedCall, type SkippedCall } from "@/features/alerts/background-plan";
import { evaluateAlerts, type AlertDecision } from "@/features/alerts/evaluate";
import { deriveAlertState } from "@/features/alerts/state";
import { buildAlertMessages } from "@/features/alerts/message";
import { relatedDeals, type RelatedDeal } from "@/features/deal-engine/related";
import type { SearchCache } from "@/features/flight-search/cache";
import { runSources, type EngineDeps } from "@/features/flight-search/engine";
import { flightKey, type FxRates } from "@/features/flight-search/normalize";
import type { SourceResult } from "@/features/flight-search/result";
import { compositeSeries, currentPrice, dealScore, selectMode, type CurrentPrice, type DealScore } from "@/features/price-history/stats";
import type { NotificationService } from "@/lib/notifications/service";
import type { SourceProvider } from "@/providers/types";
import type { FlightOffer, FlightSearchRequest, TravelDeal } from "@/types/domain";
import { toSearchRequest } from "./search-key";
import { dataModeOf, type PriceRow, type TriggerType, type Watchlist, type WatchlistStore } from "./types";

export interface RefreshDeps {
  store: WatchlistStore;
  sources: SourceProvider[];
  notifier: NotificationService;
  /** "user": a person pressed 다시 확인 · "background": the scheduler. Drives provider policy. */
  trigger: "user" | "background";
  timeoutMs: number;
  now?: () => Date;
  fxRates?: FxRates;
  cache?: SearchCache<FlightOffer[]>;
  dealCache?: SearchCache<TravelDeal[]>;
  /** Minimum gap between two manual refreshes of the same watchlist (protects API quotas). Default 60 s. */
  userRefreshMinMs?: number;
  /** Do not evaluate/send alerts (used for the initial fetch when a watchlist is created). */
  skipAlerts?: boolean;
  /** The initial fetch of a new watchlist: does not start the 다시 확인 cool-down. */
  passive?: boolean;
  /** Injectable for tests. */
  runSources?: (req: FlightSearchRequest, deps: EngineDeps) => Promise<SourceResult[]>;
  newRunId?: () => string;
}

export interface WatchlistOutcome {
  watchlistId: string;
  status: "refreshed" | "no_provider" | "throttled" | "paused" | "error";
  current?: CurrentPrice;
  previous?: number;
  score?: DealScore;
  decisions: AlertDecision[];
  /** At least one message was delivered (or dry-run logged). */
  notified: boolean;
  errors: string[];
  newRows: number;
  retryAfterSeconds?: number;
}

export interface RefreshReport {
  trigger: "user" | "background";
  startedAt: string;
  watchlists: number;
  /** Distinct provider searches actually needed (watchlists with the same search share one). */
  searchGroups: number;
  /** Real outbound requests made (demo / manual / skipped do not count). */
  networkCalls: number;
  providerCalls: { searchHash: string; provider: string; part: "flight" | "deal"; network: boolean; status: string }[];
  /** Provider parts the policy kept the scheduler from calling. */
  skippedProviders: SkippedCall[];
  outcomes: WatchlistOutcome[];
}

const DAY = 86_400_000;
const NETWORK_FAILURES = ["timeout", "error"];

/** Copy of `sources` that keeps only the planned (provider, part) pairs. */
export function restrictSources(sources: SourceProvider[], calls: PlannedCall[]): SourceProvider[] {
  const allowed = new Set(calls.map((c) => `${c.provider}:${c.part}`));
  return sources
    .map((s) => ({ ...s, flight: allowed.has(`${s.name}:flight`) ? s.flight : undefined, deal: allowed.has(`${s.name}:deal`) ? s.deal : undefined }))
    .filter((s) => s.flight || s.deal);
}

/** The cheapest few fares per provider, as price rows. */
export function offerRows(w: Watchlist, offers: FlightOffer[], runId: string, at: string, trigger: TriggerType): PriceRow[] {
  const byProvider = new Map<string, Map<string, FlightOffer>>();
  for (const o of offers) {
    const m = byProvider.get(o.provider) ?? new Map<string, FlightOffer>();
    const k = flightKey(o);
    const cur = m.get(k);
    if (!cur || o.pricePerPerson < cur.pricePerPerson) m.set(k, o);
    byProvider.set(o.provider, m);
  }
  const rows: PriceRow[] = [];
  for (const m of byProvider.values()) {
    for (const [k, o] of [...m.entries()].sort((a, b) => a[1].pricePerPerson - b[1].pricePerPerson).slice(0, 5)) {
      rows.push({
        watchlistId: w.id,
        runId,
        provider: o.provider,
        sourceType: o.isDemo ? "demo" : o.sourceType,
        flightKey: k,
        price: o.pricePerPerson,
        currency: "KRW",
        airline: o.airline,
        departureAt: o.departureAt,
        returnAt: o.returnDepartureAt,
        bookingUrl: o.bookingUrl,
        triggerType: trigger,
        dataMode: dataModeOf(o.isDemo ? "demo" : o.sourceType, trigger),
        fetchedAt: at,
      });
    }
  }
  return rows;
}

const kstMidnight = (d?: string) => (d ? `${d}T00:00:00+09:00` : undefined);

function dealRows(w: Watchlist, related: RelatedDeal[], runId: string, at: string): PriceRow[] {
  return related.map(({ deal }) => ({
    watchlistId: w.id,
    runId,
    provider: deal.provider,
    sourceType: deal.isDemo ? ("demo" as const) : deal.sourceType,
    flightKey: deal.id,
    price: deal.price,
    currency: deal.currency,
    airline: deal.airline,
    departureAt: kstMidnight(deal.travelStartDate),
    returnAt: kstMidnight(deal.travelEndDate),
    bookingUrl: deal.bookingUrl,
    triggerType: "deal" as const,
    dataMode: dataModeOf(deal.isDemo ? "demo" : deal.sourceType, "deal"),
    fetchedAt: at,
  }));
}

/** Related deals, never mixing DEMO deals with real ones. */
export function relatedDealsFor(request: FlightSearchRequest, deals: TravelDeal[]): RelatedDeal[] {
  const hasReal = deals.some((d) => !d.isDemo);
  return relatedDeals(hasReal ? deals.filter((d) => !d.isDemo) : deals, request);
}

interface IngestCtx {
  deps: Pick<RefreshDeps, "store" | "notifier" | "now" | "skipAlerts" | "sources">;
  trigger: "user" | "background";
  runId: string;
  at: string;
  /** A passive search (not a 다시 확인): do not start the manual-refresh cool-down. */
  passive?: boolean;
}

/**
 * Stores the new rows of one refresh for one watchlist, recomputes the price picture and runs the
 * Alert Engine. THE SAME FUNCTION serves user refreshes, background runs and the DEMO simulation.
 */
export async function ingestRefresh(w: Watchlist, newRows: PriceRow[], related: RelatedDeal[], ctx: IngestCtx): Promise<WatchlistOutcome> {
  const { store, notifier } = ctx.deps;
  const now = ctx.deps.now?.() ?? new Date();
  const names = Object.fromEntries(ctx.deps.sources.map((s) => [s.name, s.displayName]));

  const existing = await store.listPriceHistory(w.id);
  const before = currentPrice(existing, now);
  await store.addPriceRows(newRows);
  const all = [...existing, ...newRows];

  // Mode-consistent view (real prices only if any exist, else demo).
  const { rows: usable } = selectMode(all);
  const series = compositeSeries(usable);
  const prior = series.filter((p) => Date.parse(p.at) < Date.parse(ctx.at));
  const current = currentPrice(all, now);
  const previous = prior.length ? prior[prior.length - 1]!.price : before?.price;
  const newFlightRows = newRows.filter((r) => r.triggerType !== "deal").length;

  const patch: Parameters<WatchlistStore["updateWatchlist"]>[1] = ctx.passive ? { lastCheckedAt: ctx.at } : ctx.trigger === "user" ? { lastUserRefreshAt: ctx.at, lastCheckedAt: ctx.at } : { lastBackgroundRefreshAt: ctx.at, lastCheckedAt: ctx.at };
  if (current && newFlightRows > 0) {
    // Current and lowest price within ONE data mode (DEMO never mixes into LIVE).
    patch.currentPrice = current.price;
    patch.currentMode = current.isDemo ? "DEMO" : "LIVE";
    patch.lowestPrice = Math.min(...series.map((p) => p.price), current.price);
  }
  if (w.initialPrice === undefined && current && newFlightRows > 0) {
    patch.initialPrice = current.price;
    patch.initialIsDemo = current.isDemo;
    w = { ...w, initialPrice: current.price, initialIsDemo: current.isDemo };
  }
  await store.updateWatchlist(w.id, patch);

  const outcome: WatchlistOutcome = { watchlistId: w.id, status: "refreshed", current, previous, decisions: [], notified: false, errors: [], newRows: newRows.length };
  if (current) outcome.score = dealScore({ current: current.price, target: w.targetPrice, priorPrices: prior.map((p) => p.price) });
  // Nothing new to judge → nothing to evaluate.
  if (ctx.deps.skipAlerts || (newFlightRows === 0 && related.length === 0)) return outcome;

  const settings = await store.getNotificationSettings(w.userId);
  const state = deriveAlertState(w.id, await store.listAlertHistory({ watchlistId: w.id, limit: 1000 }), { targetPrice: w.targetPrice, priorSeries: prior });
  const decisions = evaluateAlerts({
    watchlist: w,
    settings,
    previousPrice: previous,
    currentPrice: newFlightRows > 0 ? current?.price : undefined, // fare conditions only on a fresh fare
    currentIsDemo: current?.isDemo ?? false,
    history: prior.map((p) => p.price),
    state,
    relatedDeals: related,
    now,
  });
  outcome.decisions = decisions;

  // A fare alert is only worth sending when the fare is shown with its own mode's data.
  const built = buildAlertMessages(decisions, { watchlist: w, current, score: outcome.score, names });
  const delivered: AlertDecision[] = [];
  for (const b of built) {
    const res = await notifier.send(w.notificationChannel, b.message);
    const status = res.ok ? (res.dryRun ? "dry_run" : "sent") : "failed";
    for (const d of b.decisions) {
      await store.addAlertHistory({
        watchlistId: w.id,
        alertType: d.type,
        provider: d.type === "RELATED_DEAL" ? d.deal?.deal.provider : current?.provider,
        oldPrice: d.oldPrice,
        newPrice: d.newPrice,
        dedupeKey: d.type === "RELATED_DEAL" ? d.deal?.deal.id : undefined,
        isDemo: b.message.isDemo,
        sentAt: now.toISOString(),
        status,
        channel: w.notificationChannel,
        error: res.error,
      });
    }
    if (res.ok) delivered.push(...b.decisions);
    else if (res.error) outcome.errors.push(res.error);
  }
  outcome.notified = delivered.length > 0;
  return outcome;
}

async function logCalls(store: WatchlistStore, hash: string, searchId: string, trigger: "user" | "background", results: SourceResult[], at: string, report: RefreshReport) {
  for (const { run } of results) {
    for (const part of ["flight", "deal"] as const) {
      const o = run.parts?.[part];
      if (!o?.attempted) continue; // policy-skipped / not existing: nothing happened
      const failed = o.failed;
      // Network only if a real request was made: not demo data, not a cache hit, and not a refusal before any request.
      const network = !run.isDemo && !run.cached && (failed ? NETWORK_FAILURES.includes(run.status) : true);
      const status = failed ? run.status : o.count > 0 ? "ok" : "no_results";
      await store.logProviderRun({ searchHash: hash, searchId, provider: run.provider, part, triggerType: trigger, calledAt: at, status, resultCount: o.count, network, error: failed && NETWORK_FAILURES.includes(run.status) ? run.reason : undefined }); // only technical failures are "errors"; manual/api_required/etc. are states
      report.providerCalls.push({ searchHash: hash, provider: run.provider, part, network, status });
      if (network) report.networkCalls++;
    }
  }
}

/**
 * Refreshes watchlists. User trigger: every provider that allows user searches. Background trigger:
 * ONLY the provider parts `planBackgroundRefresh()` returns — then the engine and each provider check the
 * policy again. Watchlists with an identical search share one provider search.
 */
export async function refreshWatchlists(watchlists: Watchlist[], deps: RefreshDeps): Promise<RefreshReport> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const report: RefreshReport = { trigger: deps.trigger, startedAt, watchlists: watchlists.length, searchGroups: 0, networkCalls: 0, providerCalls: [], skippedProviders: [], outcomes: [] };
  const empty = (w: Watchlist, status: WatchlistOutcome["status"], extra: Partial<WatchlistOutcome> = {}): WatchlistOutcome => ({ watchlistId: w.id, status, decisions: [], notified: false, errors: [], newRows: 0, ...extra });

  const eligible: Watchlist[] = [];
  for (const w of watchlists) {
    if (deps.trigger === "background" && !w.enabled) {
      report.outcomes.push(empty(w, "paused"));
      continue;
    }
    if (deps.trigger === "user" && w.lastUserRefreshAt) {
      const wait = (deps.userRefreshMinMs ?? 60_000) - (now().getTime() - Date.parse(w.lastUserRefreshAt));
      if (wait > 0) {
        report.outcomes.push(empty(w, "throttled", { retryAfterSeconds: Math.ceil(wait / 1000) }));
        continue;
      }
    }
    eligible.push(w);
  }

  // Scheduler fast path: if NO provider part may be polled in the background, stop here — zero network calls.
  if (deps.trigger === "background") {
    const anyAllowed = planBackgroundRefresh(deps.sources, { now: now() });
    if (anyAllowed.calls.length === 0) {
      report.skippedProviders = anyAllowed.skipped;
      for (const w of eligible) report.outcomes.push(empty(w, "no_provider"));
      return report;
    }
  }

  const groups = new Map<string, Watchlist[]>();
  for (const w of eligible) groups.set(w.searchHash, [...(groups.get(w.searchHash) ?? []), w]);
  report.searchGroups = groups.size;
  const seenSkips = new Set<string>();

  for (const [hash, ws] of groups) {
    try {
      const request = toSearchRequest(ws[0]!);
      let sources = deps.sources;
      if (deps.trigger === "background") {
        // Reuse instead of re-calling: a part called (over the network) more recently than its minimum interval is not due.
        const calls = await deps.store.listProviderRuns({ searchHash: hash, since: new Date(now().getTime() - 7 * DAY).toISOString() });
        const lastCalledAt: Record<string, string> = {};
        for (const c of calls) if (c.network && (!lastCalledAt[`${c.provider}:${c.part}`] || c.calledAt > lastCalledAt[`${c.provider}:${c.part}`]!)) lastCalledAt[`${c.provider}:${c.part}`] = c.calledAt;
        const plan = planBackgroundRefresh(deps.sources, { now: now(), lastCalledAt });
        for (const s of plan.skipped) {
          const key = `${s.provider}:${s.part}:${s.kind}`;
          if (seenSkips.has(key)) continue;
          seenSkips.add(key);
          report.skippedProviders.push(s);
        }
        sources = restrictSources(deps.sources, plan.calls);
        if (sources.length === 0) {
          for (const w of ws) report.outcomes.push(empty(w, "no_provider"));
          continue;
        }
      }

      const at = now().toISOString();
      const runId = deps.newRunId?.() ?? randomUUID();
      const results = await (deps.runSources ?? runSources)(request, { sources, trigger: deps.trigger, timeoutMs: deps.timeoutMs, fxRates: deps.fxRates, cache: deps.cache, dealCache: deps.dealCache, now });
      await logCalls(deps.store, hash, runId, deps.trigger, results, at, report);

      const offers = results.flatMap((r) => r.offers);
      const related = relatedDealsFor(request, results.flatMap((r) => r.deals));
      for (const w of ws) {
        try {
          const rows = [...offerRows(w, offers, runId, at, deps.trigger), ...dealRows(w, related, runId, at)];
          report.outcomes.push(await ingestRefresh(w, rows, related, { deps, trigger: deps.trigger, runId, at, passive: deps.passive }));
        } catch (e) {
          report.outcomes.push(empty(w, "error", { errors: [e instanceof Error ? e.message.slice(0, 200) : "refresh failed"] }));
        }
      }
    } catch (e) {
      for (const w of ws) report.outcomes.push(empty(w, "error", { errors: [e instanceof Error ? e.message.slice(0, 200) : "refresh failed"] }));
    }
  }
  return report;
}

/** Cron entry point: every enabled watchlist, background trigger, policy-gated. */
export async function runBackgroundScheduler(deps: Omit<RefreshDeps, "trigger">): Promise<RefreshReport> {
  return refreshWatchlists(await deps.store.listAllWatchlists(), { ...deps, trigger: "background" });
}

/** DEMO only: pretends the price fell by `percent` and runs the real alert pipeline. */
export async function simulateDemoDrop(w: Watchlist, opts: Pick<RefreshDeps, "store" | "notifier" | "sources" | "now"> & { percent?: number }): Promise<WatchlistOutcome | undefined> {
  const now = opts.now?.() ?? new Date();
  const existing = await opts.store.listPriceHistory(w.id);
  const cur = currentPrice(existing, now);
  if (!cur || !cur.isDemo) return undefined; // only ever on DEMO data
  const at = now.toISOString();
  const price = Math.max(1000, Math.round((cur.price * (1 - (opts.percent ?? 10) / 100)) / 100) * 100);
  const runId = randomUUID();
  const row: PriceRow = { watchlistId: w.id, runId, provider: cur.provider, sourceType: "demo", flightKey: "demo-sim", price, currency: "KRW", airline: cur.airline, bookingUrl: cur.bookingUrl, triggerType: "user", dataMode: "DEMO", fetchedAt: at };
  return ingestRefresh(w, [row], [], { deps: opts, trigger: "user", runId, at });
}
