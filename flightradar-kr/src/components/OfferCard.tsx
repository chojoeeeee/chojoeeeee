import { getAirport } from "@/config/airports";
import type { FlightGroup } from "@/features/flight-search/compare";
import { formatClock, formatDuration, formatKrw, formatMonthDay, minutesSince } from "@/lib/format";
import { DemoBadge } from "./DemoBadge";

export function OfferCard({ group, providerNames, tag }: { group: FlightGroup; providerNames: Record<string, string>; tag?: string }) {
  const o = group.best;
  const baggage = o.baggage.checkedKg === null ? "수하물 정보 없음" : o.baggage.checkedKg === 0 ? "수하물 불포함" : `수하물 ${o.baggage.checkedKg}kg`;
  const age = minutesSince(o.fetchedAt);
  return (
    <article className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs">
        {tag && <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-brand">{tag}</span>}
        {o.isDemo && <DemoBadge />}
        <span className="text-muted">{age < 1 ? "방금 조회" : `${age}분 전 조회 · 참고가격`}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{o.airline} <span className="font-normal text-muted">{o.outboundFlightNumber}</span></p>
          <Leg from={o.originAirport} to={o.destinationAirport} dep={o.departureAt} arr={o.arrivalAt} date={o.departureAt.slice(0, 10)} />
          {o.returnDepartureAt && o.returnArrivalAt && (
            <Leg from={o.destinationAirport} to={o.originAirport} dep={o.returnDepartureAt} arr={o.returnArrivalAt} date={o.returnDepartureAt.slice(0, 10)} />
          )}
          <p className="text-xs text-muted">
            {o.stops === 0 ? "직항" : `경유 ${o.stops}회`} · 총 {formatDuration(o.totalDurationMinutes)} · {baggage}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold">{formatKrw(o.pricePerPerson)}</p>
          <p className="text-xs text-muted">1인 · 총 {formatKrw(o.totalPrice)}</p>
          <p className="mt-1 text-xs text-muted">{providerNames[o.provider] ?? o.provider}</p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        {group.offers.map((x) => (
          <li key={x.id}>{providerNames[x.provider] ?? x.provider} <span className="font-semibold text-fg">{formatKrw(x.pricePerPerson)}</span></li>
        ))}
      </ul>

      <div className="mt-3">
        {o.isDemo ? (
          <span className="block w-full rounded-xl bg-slate-100 py-2.5 text-center text-sm text-muted">DEMO — 실제 예약 링크가 없어요</span>
        ) : (
          <a href={o.bookingUrl} target="_blank" rel="noopener noreferrer sponsored" className="block w-full rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-white">예약하러 가기</a>
        )}
      </div>
    </article>
  );
}

function Leg({ from, to, dep, arr, date }: { from: string; to: string; dep: string; arr: string; date: string }) {
  return (
    <p>
      <span className="mr-2 text-xs text-muted">{formatMonthDay(date)}</span>
      <span className="font-medium">{from}</span> {formatClock(dep)} <span className="text-muted">→</span> <span className="font-medium">{to}</span> {formatClock(arr)}
      <span className="ml-2 text-xs text-muted">{getAirport(from)?.city}→{getAirport(to)?.city}</span>
    </p>
  );
}
