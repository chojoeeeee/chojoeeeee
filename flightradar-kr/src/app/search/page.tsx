import Link from "next/link";
import { OfferCard } from "@/components/OfferCard";
import { DemoBadge } from "@/components/DemoBadge";
import { ProviderPriceTable } from "@/components/ProviderPriceTable";
import { ProviderStatusBar } from "@/components/ProviderStatusBar";
import { SearchForm } from "@/components/SearchForm";
import { getAirport } from "@/config/airports";
import { sortGroups, type SortMode } from "@/features/flight-search/compare";
import { parseSearchParams, toRequest } from "@/features/flight-search/schema";
import { searchFlights } from "@/features/flight-search/service";
import { formatKrw, formatMonthDay } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "price", label: "최저가순" },
  { mode: "recommended", label: "추천순" },
  { mode: "departure", label: "출발시간순" },
  { mode: "duration", label: "비행시간순" },
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);

  if (!parsed.success) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">검색 조건을 확인해주세요.</p>
          <ul className="mt-1 list-disc pl-5">{parsed.error.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>
        </div>
        <SearchForm />
      </div>
    );
  }

  const p = parsed.data;
  const result = await searchFlights(toRequest(p));
  const sortParam = typeof raw.sort === "string" ? raw.sort : "price";
  const sort: SortMode = SORTS.some((s) => s.mode === sortParam) ? (sortParam as SortMode) : "price";
  const groups = sortGroups(result.groups, sort);

  const names = Object.fromEntries(result.providers.map((r) => [r.provider, r.displayName]));
  const cheapest = result.recommendations.cheapest?.best;
  const tags = new Map<string, string>();
  const rec = result.recommendations;
  if (rec.comfortable) tags.set(rec.comfortable.key, "✈️ 편한 항공편");
  if (rec.recommended) tags.set(rec.recommended.key, "⭐ 추천");
  if (rec.cheapest) tags.set(rec.cheapest.key, "🏆 최저가");

  const sortHref = (mode: SortMode) => {
    const q = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])));
    q.set("sort", mode);
    return `/search?${q.toString()}`;
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">
          {getAirport(p.origin)?.city ?? p.origin} → {getAirport(p.destination)?.city ?? p.destination}
        </h1>
        <p className="text-sm text-muted">
          {formatMonthDay(p.departureDate)}{p.returnDate && ` ~ ${formatMonthDay(p.returnDate)}`} · {p.adults + p.children}명
          {p.nearby && " · 주변 공항 포함"}{p.directOnly && " · 직항만"}
        </p>
      </header>

      {result.dataMode === "demo" && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <DemoBadge className="mr-2" />
          아직 실제 API가 연결되지 않아 <strong>데모 데이터</strong>를 보여주고 있어요. 표시된 가격은 실제 항공권 가격이 아니에요.
        </div>
      )}

      <ProviderStatusBar result={result} />

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center text-sm text-muted">
          <p className="font-semibold text-fg">조건에 맞는 항공권을 찾지 못했어요.</p>
          <p className="mt-1">날짜를 바꾸거나 &lsquo;직항만&rsquo; 옵션을 해제해보세요.</p>
          <Link href="/" className="mt-3 inline-block text-brand underline">다시 검색하기</Link>
        </div>
      ) : (
        <>
          {cheapest && (
            <section className="rounded-2xl bg-brand p-5 text-white">
              <p className="text-sm opacity-80">현재 최저가 (1인 기준)</p>
              <p className="text-3xl font-bold">{formatKrw(cheapest.pricePerPerson)}</p>
              <p className="mt-1 text-xs opacity-80">{names[cheapest.provider] ?? cheapest.provider} · 가격 위치 판단은 가격 기록이 쌓인 뒤 제공돼요</p>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">판매처별 최저가</h2>
            <ProviderPriceTable prices={result.providerPrices} names={names} />
          </section>

          <nav className="flex gap-2 overflow-x-auto text-sm" aria-label="정렬">
            {SORTS.map((s) => (
              <Link key={s.mode} href={sortHref(s.mode)} className={`whitespace-nowrap rounded-full border px-3 py-1 ${s.mode === sort ? "border-brand bg-brand text-white" : "border-line bg-card"}`}>{s.label}</Link>
            ))}
          </nav>

          <section className="space-y-3">
            {groups.map((g) => (
              <OfferCard key={g.key} group={g} providerNames={names} tag={tags.get(g.key)} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
