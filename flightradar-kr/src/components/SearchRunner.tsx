"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { assembleResult, failedSourceResult, type SourceInfo, type SourceResult, type SourceRow } from "@/features/flight-search/result";
import { bestSaving, cheapestForDates, shiftedDates, type DatePrice } from "@/features/flight-search/flex";
import { formatKrw } from "@/lib/format";
import { userStatus } from "@/lib/status-labels";
import type { FlightSearchRequest } from "@/types/domain";
import { DealCard, PriceCard, QuietRow, SavingsNote } from "./ResultCards";
import { TrackCta } from "./TrackCta";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const range = (dep: string, ret?: string) => (ret ? `${md(dep)} ~ ${md(ret)}` : md(dep));

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

interface Props {
  request: FlightSearchRequest;
  query: string;
  sources: SourceInfo[];
  label: { from: string; to: string };
  flexDays: number;
  today: string;
}

export function SearchRunner({ request, query, sources, label, flexDays, today }: Props) {
  const [attempt, setAttempt] = useState(0);
  const runId = `${query}#${attempt}`;
  const [state, setState] = useState<{ runId: string; results: Record<string, SourceResult | undefined>; done: boolean }>({ runId, results: {}, done: false });
  const [flexState, setFlexState] = useState<{ runId: string; items: Record<number, DatePrice> }>({ runId, items: {} });
  const current = state.runId === runId ? state : { runId, results: {}, done: false };
  const { results, done } = current;
  const flexItems = flexState.runId === runId ? flexState.items : {};

  // All six services run independently; each result appears as soon as it is known.
  useEffect(() => {
    const ctrl = new AbortController();
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

  // "날짜 ±3일": only after the chosen dates are done, only flight services, 3 date combinations at a time.
  const shifted = useMemo(() => (flexDays > 0 ? shiftedDates(request, flexDays, today) : []), [request, flexDays, today]);
  useEffect(() => {
    if (!done || shifted.length === 0) return;
    const ctrl = new AbortController();
    const flightSources = sources.filter((s) => s.role === "flight");
    let next = 0;
    const worker = async () => {
      while (next < shifted.length && !ctrl.signal.aborted) {
        const d = shifted[next++]!;
        const params = new URLSearchParams(query);
        params.set("departureDate", d.departureDate);
        if (d.returnDate) params.set("returnDate", d.returnDate);
        try {
          const rs = await Promise.all(flightSources.map((s) => fetchSource(s, params.toString(), ctrl.signal)));
          if (ctrl.signal.aborted) return;
          const price = cheapestForDates(request, d, rs);
          setFlexState((prev) => ({ runId, items: { ...(prev.runId === runId ? prev.items : {}), [d.offset]: price } }));
        } catch {
          return; // aborted
        }
      }
    };
    void Promise.allSettled([worker(), worker(), worker()]);
    return () => ctrl.abort();
  }, [done, shifted, sources, query, request, runId]);

  if (!result) {
    const finished = sources.filter((s) => results[s.name]).length;
    return (
      <section aria-live="polite" className="space-y-4 pt-2">
        <div>
          <h1 className="text-2xl font-extrabold">{label.from} → {label.to}</h1>
          <p className="mt-1 text-sm text-muted">{sources.length}개 사이트에서 가격을 찾고 있어요 ({finished}/{sources.length})</p>
        </div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
          {sources.map((s) => {
            const r = results[s.name];
            return (
              <li key={s.name} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-medium">{s.displayName}</span>
                {!r ? (
                  <span className="flex items-center gap-2 text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />찾는 중</span>
                ) : r.run.status === "ok" || r.run.status === "deals_only" ? (
                  <span className="font-semibold text-green-700">완료 ✓</span>
                ) : (
                  <span className="text-muted">확인 완료</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const cheapest = result.recommendations.cheapest?.best;
  const chosenPrice = cheapest?.pricePerPerson;
  const names = Object.fromEntries(sources.map((s) => [s.name, s.displayName]));

  const flightRows = result.sources.filter((r) => r.role === "flight" && userStatus(r));
  const withPrice = flightRows.filter((r) => r.bestOffer && r.status === "ok").sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const flightQuiet = flightRows.filter((r) => !(r.bestOffer && r.status === "ok"));
  const dealRows = result.sources.filter((r) => r.role === "deal" && userStatus(r));

  // One tip at most: whichever saves more — a cheaper nearby date, or a related deal on a nearby date.
  const flexList = shifted.map((d) => flexItems[d.offset]).filter((x): x is DatePrice => Boolean(x));
  const flexSaving = bestSaving({ price: chosenPrice, isDemo: cheapest?.isDemo ?? false }, flexList);
  const dealTip = result.savingsTip;
  const tip =
    flexSaving && (!dealTip || flexSaving.savingPerPerson >= dealTip.savingPerPerson)
      ? { shiftDays: flexSaving.date.offset, saving: flexSaving.savingPerPerson, from: `${range(flexSaving.date.departureDate, flexSaving.date.returnDate)} 일정 · 1인 ${formatKrw(flexSaving.date.price!)}` }
      : dealTip
        ? { shiftDays: dealTip.shiftDays, saving: dealTip.savingPerPerson, from: `${names[dealTip.deal.provider] ?? dealTip.deal.provider} 특가 · ${dealTip.deal.travelStartDate ? range(dealTip.deal.travelStartDate, dealTip.deal.travelEndDate) : ""}` }
        : undefined;

  const { total, confirmed, live } = result.summary;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/" className="text-xs font-medium text-muted">← 다시 검색</Link>
        <h1 className="mt-1 text-2xl font-extrabold">{label.from} → {label.to}</h1>
        <p className="text-sm text-muted">
          {range(request.departureDate, request.returnDate)} · 성인 {request.adults}명{request.directOnly && " · 직항만"}
        </p>
      </header>

      <section className={`rounded-3xl p-5 ${cheapest ? "bg-brand text-white" : "bg-soft"}`}>
        {cheapest ? (
          <>
            <p className="text-sm font-medium opacity-90">현재 최저가 <span className="opacity-75">(1인)</span></p>
            <p className="mt-1 whitespace-nowrap text-5xl font-extrabold leading-none tracking-tight">{formatKrw(cheapest.pricePerPerson)}</p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm opacity-95">
              {names[cheapest.provider] ?? cheapest.provider} · {cheapest.airline}
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">{cheapest.isDemo ? "테스트 데이터" : "실시간 확인"}</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold">지금은 확인된 가격이 없어요</p>
            <p className="mt-1 text-sm text-muted">아래 서비스에서 직접 확인해 보세요.</p>
          </>
        )}
      </section>
      <p className="-mt-3 text-center text-xs text-muted">
        {live === 0 && confirmed > 0 ? "테스트 데이터로 보여드리고 있어요" : `${total}개 사이트 중 ${confirmed}곳에서 확인했어요`}
      </p>

      {tip && <SavingsNote shiftDays={tip.shiftDays} saving={tip.saving} from={tip.from} />}

      <section className="space-y-2">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold">실제 일정 가격 비교</h2>
          <button onClick={() => setAttempt((n) => n + 1)} className="text-xs font-medium text-muted underline">다시 조회</button>
        </div>
        <ul className="space-y-3">
          {withPrice.map((r) => <PriceCard key={r.provider} row={r} />)}
          {flightQuiet.map((r) => <QuietRow key={r.provider} row={r} />)}
        </ul>
      </section>

      {flexDays > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">다른 날짜는?</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
            {[-3, -2, -1, 0, 1, 2, 3]
              .filter((o) => Math.abs(o) <= flexDays)
              .map((o) => {
                const s = shifted.find((x) => x.offset === o);
                if (o !== 0 && !s) return null; // before today
                const price = o === 0 ? (cheapest ? { price: cheapest.pricePerPerson, isDemo: cheapest.isDemo } : { price: undefined, isDemo: false }) : flexItems[o];
                const dep = o === 0 ? request.departureDate : s!.departureDate;
                const ret = o === 0 ? request.returnDate : s!.returnDate;
                const diff = o !== 0 && price?.price !== undefined && chosenPrice !== undefined && price.isDemo === (cheapest?.isDemo ?? false) ? price.price - chosenPrice : undefined;
                return (
                  <li key={o} className={`flex items-center justify-between px-4 py-2.5 ${o === 0 ? "bg-brand-soft" : ""}`}>
                    <span className="font-medium">{range(dep, ret)} {o === 0 && <span className="ml-1 text-xs font-bold text-brand">선택</span>}</span>
                    <span className="text-right">
                      {price === undefined ? <span className="text-muted">확인 중…</span> : price.price === undefined ? <span className="text-muted">가격 없음</span> : <strong>{formatKrw(price.price)}</strong>}
                      {diff !== undefined && diff !== 0 && <span className={`ml-2 text-xs font-semibold ${diff < 0 ? "text-green-700" : "text-muted"}`}>{diff < 0 ? "−" : "+"}{formatKrw(Math.abs(diff))}</span>}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-bold">관련 특가</h2>
          <p className="text-xs text-muted">일정이 정확히 같지 않을 수 있어 가격 순위에 넣지 않았어요.</p>
        </div>
        <ul className="space-y-3">
          {dealRows.flatMap((r) => (r.related.length > 0 ? r.related.slice(0, 2).map((rel) => <DealCard key={rel.deal.id} row={r} related={rel} />) : [<QuietRow key={r.provider} row={r} note={dealNote(r)} />]))}
        </ul>
      </section>

      <TrackCta request={request} cheapest={cheapest ? { price: cheapest.pricePerPerson, isDemo: cheapest.isDemo } : undefined} />
    </div>
  );
}

function dealNote(r: SourceRow): string | undefined {
  const s = userStatus(r);
  return s?.hasData ? "선택한 일정과 맞는 특가가 없어요" : undefined; // otherwise the row falls back to its own status line
}

