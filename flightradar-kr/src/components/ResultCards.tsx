import { placeName } from "@/config/airports";
import { describeShift, type RelatedDeal } from "@/features/deal-engine/related";
import type { SourceRow } from "@/features/flight-search/result";
import { formatKrw } from "@/lib/format";
import { userStatus } from "@/lib/status-labels";
import { daysBetween } from "@/lib/dates";
import { DemoBadge } from "./DemoBadge";
import { Pill } from "./Pill";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

const button = "inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold";

/** A button that opens the seller's page — or, for test data, a disabled stand-in (no real link exists). */
function OpenButton({ href, demo, label }: { href: string; demo: boolean; label: string }) {
  if (demo) return <span className={`${button} bg-soft text-muted`} aria-disabled="true">{label}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer sponsored" className={`${button} bg-brand text-white`}>
      {label}
    </a>
  );
}

function baggageText(kg: number | null): string {
  return kg === null ? "수하물 정보 없음" : kg === 0 ? "수하물 불포함" : `수하물 ${kg}kg`;
}

/** One service that returned a real-schedule price. (Test/real status is shown once, on the headline price.) */
export function PriceCard({ row }: { row: SourceRow }) {
  const o = row.bestOffer!;
  const cheapest = row.diffFromBest === 0;
  const seller = o.seller && o.seller !== row.displayName ? o.seller : undefined;
  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{row.displayName}</p>
        {cheapest ? <Pill tone="live">최저가</Pill> : <span className="text-xs font-semibold text-muted">+{formatKrw(row.diffFromBest ?? 0)}</span>}
      </div>
      <p className="mt-2 whitespace-nowrap text-[32px] font-extrabold leading-none tracking-tight">
        {formatKrw(o.pricePerPerson)}
        <span className="ml-1 text-sm font-medium text-muted">/ 1인</span>
      </p>
      <p className="mt-2 text-sm text-muted">
        {o.airline} · {o.stops === 0 ? "직항" : `경유 ${o.stops}회`} · {baggageText(o.baggage.checkedKg)}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted">{seller && `판매처 ${seller}`}</p>
        <OpenButton href={o.bookingUrl} demo={o.isDemo} label="확인하기" />
      </div>
    </li>
  );
}

/** A service that did not return anything to show: one quiet line, never a big card. */
export function QuietRow({ row, note }: { row: SourceRow; note?: string }) {
  const status = userStatus(row);
  if (!status) return null; // internal states are not shown to users
  const canOpen = status.tone !== "empty";
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-soft px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold">{row.displayName}</p>
        {(note !== undefined || status.tone !== "manual") && <p className="text-xs text-muted">{note ?? status.text}</p>}
      </div>
      {canOpen && (
        <a href={row.directUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-brand">
          직접 확인 ›
        </a>
      )}
    </li>
  );
}

function periodText(start?: string, end?: string): string {
  if (!start || !end) return "";
  const nights = daysBetween(start, end);
  return `${md(start)} ~ ${md(end)}${nights > 0 ? ` (${nights}박 ${nights + 1}일)` : ""}`;
}

function differenceText(r: RelatedDeal): string {
  switch (r.match) {
    case "same_dates":
      return "선택한 일정과 같아요";
    case "near_dates":
      return `선택한 일정보다 ${Math.abs(r.shiftDays ?? 0)}일 ${(r.shiftDays ?? 0) < 0 ? "빨라요" : "늦어요"}`;
    case "window":
      return "선택한 일정이 포함된 기간이에요";
    default:
      return "날짜 미정 · 같은 노선 특가";
  }
}

export function DealCard({ row, related }: { row: SourceRow; related: RelatedDeal }) {
  const d = related.deal;
  const period = periodText(d.travelStartDate, d.travelEndDate);
  return (
    <li className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{row.displayName}</p>
        {d.discountRate !== undefined && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">평균 대비 -{Math.round(d.discountRate * 100)}%</span>}
      </div>
      <p className="mt-2 text-sm text-muted">{placeName(d.destination) || d.title}</p>
      <p className="whitespace-nowrap text-[28px] font-extrabold leading-tight tracking-tight">
        {formatKrw(d.price)}<span className="text-base">~</span>
      </p>
      <p className="mt-1 text-sm">{period || differenceText(related)}</p>
      {period && <p className="text-xs text-muted">{differenceText(related)}</p>}
      <div className="mt-3 flex justify-end">
        <OpenButton href={d.bookingUrl} demo={d.isDemo} label="특가 확인" />
      </div>
    </li>
  );
}

export function SavingsNote({ shiftDays, saving, from }: { shiftDays: number; saving: number; from: string }) {
  return (
    <div role="status" className="rounded-2xl bg-green-50 p-4 text-sm text-green-900">
      💡 일정을 <strong>{describeShift(shiftDays)}</strong> 1인당 약 <strong>{formatKrw(saving)}</strong> 아낄 수 있어요.
      <span className="mt-0.5 block text-xs text-green-800">{from}</span>
    </div>
  );
}

export { DemoBadge };
