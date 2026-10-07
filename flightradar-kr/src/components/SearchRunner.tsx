"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sortGroups, type SortMode } from "@/features/flight-search/compare";
import { assembleResult, failedSourceResult, type SourceInfo, type SourceResult } from "@/features/flight-search/result";
import { formatKrw, formatMonthDay } from "@/lib/format";
import type { FlightSearchRequest } from "@/types/domain";
import { DemoBadge } from "./DemoBadge";
import { OfferCard } from "./OfferCard";
import { SavingsBanner } from "./RelatedDeals";
import { TrackForm } from "./TrackForm";
import { SourceProgress } from "./SourceProgress";
import { SourceRows } from "./SourceRows";

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "price", label: "최저가순" },
  { mode: "recommended", label: "추천순" },
  { mode: "departure", label: "출발시간순" },
  { mode: "duration", label: "비행시간순" },
];

async function fetchSource(info: SourceInfo, query: string, signal: AbortSignal): Promise<SourceResult> {
  try {
    const res = await fetch(`/api/search/source?provider=${encodeURIComponent(info.name)}&${query}`, { signal, cache: "no-store" });
    if (!res.ok) return failedSourceResult(info, "서버에서 조회에 실패했습니다.");
    return (await res.json()) as SourceResult;
  } catch (e) {
    if (signal.aborted) throw e;
    return failedSourceResult(info, "네트워크 오류로 조회하지 못했습니다.");
  }
}

export function SearchRunner({ request, query, sources, label }: { request: FlightSearchRequest; query: string; sources: SourceInfo[]; label: { from: string; to: string } }) {
  // State is tagged with the run it belongs to, so a new query/retry starts
  // from empty without resetting state inside the effect.
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);
  const runId = `${query}#${attempt}`;
  const [state, setState] = useState<{ runId: string; results: Record<string, SourceResult | undefined>; done: boolean }>({ runId, results: {}, done: false });
  const [sort, setSort] = useState<SortMode>("price");
  const current = state.runId === runId ? state : { runId, results: {}, done: false };
  const { results, done } = current;

  useEffect(() => {
    const ctrl = new AbortController();
    // allSettled: every source runs to completion independently.
    Promise.allSettled(
      sources.map(async (s) => {
        const r = await fetchSource(s, query, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setState((prev) => ({ runId, results: { ...(prev.runId === runId ? prev.results : {}), [s.name]: r }, done: false }));
      }),
    ).then(() => {
      if (!ctrl.signal.aborted) setState((prev) => ({ runId, results: prev.runId === runId ? prev.results : {}, done: true }));
    });
    return () => ctrl.abort();
  }, [runId, query, sources]);

  const result = useMemo(
    () => (done ? assembleResult(request, sources.map((s) => results[s.name] ?? failedSourceResult(s, "조회 결과를 받지 못했습니다."))) : undefined),
    [done, request, sources, results],
  );

  if (!result) return <SourceProgress sources={sources} results={results} />;

  const names = Object.fromEntries(sources.map((s) => [s.name, s.displayName]));
  const cheapest = result.recommendations.cheapest?.best;
  const tags = new Map<string, string>();
  const rec = result.recommendations;
  if (rec.comfortable) tags.set(rec.comfortable.key, "✈️ 편한 항공편");
  if (rec.recommended) tags.set(rec.recommended.key, "⭐ 추천");
  if (rec.cheapest) tags.set(rec.cheapest.key, "🏆 최저가");
  const groups = sortGroups(result.groups, sort);
  const { total, confirmed, live } = result.summary;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">{label.from} → {label.to}</h1>
        <p className="text-sm text-muted">
          {request.departureDate.replaceAll("-", ".")}{request.returnDate && ` ~ ${formatMonthDay(request.returnDate)}`} · 성인 {request.adults}명
          {request.origins.length > 1 && " · 주변 공항 포함"}{request.directOnly && " · 직항만"}
        </p>
        <p className="mt-1 text-sm font-medium">
          {live === 0 && confirmed > 0 ? (
            <>{total}개 서비스 중 실제로 확인한 서비스 <strong>0개</strong> · 데모 데이터 {confirmed}개 표시 중</>
          ) : (
            <>{total}개 서비스 중 <strong>{confirmed}개</strong> 서비스에서 정보를 확인했습니다.</>
          )}
        </p>
      </header>

      {result.dataMode === "demo" && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <DemoBadge className="mr-2" />표시된 가격·특가는 <strong>실제 데이터가 아닌 데모 데이터</strong>예요. API 연결 후 실제 가격으로 바뀝니다.
        </div>
      )}

      {cheapest ? (
        <section className="rounded-2xl bg-brand p-5 text-white">
          <p className="text-sm opacity-80">{result.dataMode === "demo" ? "데모 데이터 중 가장 저렴한 조건" : "실제 일정 기준 가장 저렴한 조건"} (1인 기준)</p>
          <p className="text-3xl font-bold">{formatKrw(cheapest.pricePerPerson)}</p>
          <p className="mt-1 text-xs opacity-80">{names[cheapest.provider] ?? cheapest.provider} · {cheapest.airline}</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-card p-5 text-sm text-muted">
          지금은 비교할 수 있는 실제 일정 항공권 가격이 없어요. 아래 서비스 상태를 확인해보세요.
        </section>
      )}

      {result.savingsTip && <SavingsBanner tip={result.savingsTip} names={names} />}

      <TrackForm request={request} cheapest={cheapest ? { price: cheapest.pricePerPerson, isDemo: cheapest.isDemo } : undefined} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">실제 일정 가격 비교</h2>
          <button onClick={retry} className="text-xs text-brand underline">다시 조회</button>
        </div>
        <p className="text-xs text-muted">정확한 날짜로 가격을 확인할 수 있는 서비스만 순위에 넣어요.</p>
        <SourceRows rows={result.sources} role="flight" />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">🔥 관련 특가</h2>
        <p className="text-xs text-muted">특가는 일정이 정확히 같지 않을 수 있어 가격 순위에 넣지 않고 따로 보여드려요.</p>
        <SourceRows rows={result.sources} role="deal" />
      </section>

      {groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">항공편 상세</h2>
          <div className="flex gap-2 overflow-x-auto text-sm" role="group" aria-label="정렬">
            {SORTS.map((s) => (
              <button key={s.mode} onClick={() => setSort(s.mode)} aria-pressed={s.mode === sort} className={`whitespace-nowrap rounded-full border px-3 py-1 ${s.mode === sort ? "border-brand bg-brand text-white" : "border-line bg-card"}`}>{s.label}</button>
            ))}
          </div>
          {groups.map((g) => (
            <OfferCard key={g.key} group={g} providerNames={names} tag={tags.get(g.key)} />
          ))}
        </section>
      )}

      {groups.length === 0 && (
        <p className="text-center text-xs text-muted">
          <Link href="/" className="text-brand underline">다른 조건으로 검색하기</Link>
        </p>
      )}
    </div>
  );
}
