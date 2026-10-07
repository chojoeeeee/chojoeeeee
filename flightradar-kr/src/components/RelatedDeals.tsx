import { describeShift, type RelatedDeal, type SavingsTip } from "@/features/deal-engine/related";
import { formatKrw } from "@/lib/format";
import { DemoBadge } from "./DemoBadge";

const MATCH_TEXT: Record<RelatedDeal["match"], string> = {
  window: "현재 선택 날짜가 포함된 특가입니다.",
  same_dates: "현재 선택 날짜와 같은 특가입니다.",
  near_dates: "현재 선택 날짜와 비슷한 특가입니다.",
  destination_only: "같은 여행지의 특가입니다.",
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function SavingsBanner({ tip, names }: { tip: SavingsTip; names: Record<string, string> }) {
  return (
    <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      💡 여행 일정을 {describeShift(tip.shiftDays)} 1인당 최대 <strong>{formatKrw(tip.savingPerPerson)}</strong>을 절약할 수 있습니다.
      <span className="block text-xs text-green-800">
        {names[tip.deal.provider] ?? tip.deal.provider} 특가 {tip.deal.travelStartDate && md(tip.deal.travelStartDate)}~{tip.deal.travelEndDate && md(tip.deal.travelEndDate)} · {formatKrw(tip.deal.price)}~ {tip.deal.isDemo && "(DEMO DATA)"}
      </span>
    </div>
  );
}

export function RelatedDeals({ deals, names }: { deals: RelatedDeal[]; names: Record<string, string> }) {
  if (deals.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">🔥 관련 특가</h2>
      <ul className="space-y-2">
        {deals.map(({ deal, match }) => (
          <li key={deal.id} className="rounded-xl border border-line bg-card p-4 text-sm">
            <p className="font-semibold">
              {names[deal.provider] ?? deal.provider} {deal.isDemo && <DemoBadge className="ml-1" />}
            </p>
            <p>{deal.title} · <strong>{formatKrw(deal.price)}~</strong></p>
            {deal.travelStartDate && deal.travelEndDate && <p className="text-xs text-muted">여행 기간 {md(deal.travelStartDate)}~{md(deal.travelEndDate)}</p>}
            <p className="mt-1 text-xs text-muted">{MATCH_TEXT[match]}</p>
            {deal.isDemo ? (
              <span className="mt-2 inline-block text-xs text-muted">DEMO — 실제 링크가 없어요</span>
            ) : (
              <a href={deal.bookingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">확인</a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
