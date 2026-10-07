import { describeShift, type RelatedDeal, type SavingsTip } from "@/features/deal-engine/related";
import { formatKrw } from "@/lib/format";
import { DemoBadge } from "./DemoBadge";

const MATCH_TEXT: Record<RelatedDeal["match"], string> = {
  window: "현재 선택 날짜가 포함된 특가입니다.",
  same_dates: "현재 선택 날짜와 같은 일정의 특가입니다.",
  near_dates: "비슷한 일정 특가입니다.",
  destination_only: "같은 노선의 특가입니다. (날짜 정보 없음)",
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function SavingsBanner({ tip, names }: { tip: SavingsTip; names: Record<string, string> }) {
  return (
    <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      💡 일정을 {describeShift(tip.shiftDays)} 1인당 약 <strong>{formatKrw(tip.savingPerPerson)}</strong> 절약할 수 있습니다.
      <span className="block text-xs text-green-800">
        {names[tip.deal.provider] ?? tip.deal.provider} 특가 {tip.deal.travelStartDate && md(tip.deal.travelStartDate)}~{tip.deal.travelEndDate && md(tip.deal.travelEndDate)} · {formatKrw(tip.deal.price)}~ {tip.deal.isDemo && "(DEMO DATA)"}
      </span>
    </div>
  );
}

/** One deal. Deals are never ranked against flight prices — they live in their own area. */
export function DealCard({ related }: { related: RelatedDeal }) {
  const { deal, match, shiftDays } = related;
  return (
    <div className="rounded-lg border border-line p-3 text-sm">
      <p>
        {deal.title} · <strong>{formatKrw(deal.price)}~</strong>
        {deal.isDemo && <DemoBadge className="ml-1" />}
      </p>
      {deal.discountRate !== undefined && (
        <p className="text-xs text-green-700">
          평균 대비 -{Math.round(deal.discountRate * 100)}%{deal.originalPrice ? ` (평균 ${formatKrw(deal.originalPrice)})` : ""}
        </p>
      )}
      {deal.travelStartDate && deal.travelEndDate && (
        <p className="text-xs text-muted">
          여행 일정 {md(deal.travelStartDate)}~{md(deal.travelEndDate)}
          {match === "near_dates" && shiftDays !== undefined && ` · 선택 일정과 ${Math.abs(shiftDays)}일 차이`}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">{MATCH_TEXT[match]}</p>
      {deal.isDemo ? (
        <span className="mt-2 inline-block text-xs text-muted">DEMO — 실제 링크가 없어요</span>
      ) : (
        <a href={deal.bookingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">특가 확인</a>
      )}
    </div>
  );
}
