import type { SourceRow, SourceStatus } from "@/features/flight-search/result";
import { formatKrw, formatKstClock } from "@/lib/format";
import { SourceBadge, badgeFor, connectionLabel } from "./SourceBadge";

const STATUS_TEXT: Record<SourceStatus, string> = {
  ok: "✓ 조회 성공",
  deals_only: "✓ 특가 조회 성공",
  no_results: "⚠ 현재 검색 결과 없음",
  manual_check: "⚠ 자동 가격 조회 제한",
  api_required: "⚠ API 키 필요",
  partner_required: "⚠ 제휴 승인 필요",
  unavailable: "⚠ 연결 안 됨",
  timeout: "⚠ 응답 시간 초과",
  error: "⚠ 일시적 오류",
};

function CheckLink({ row, label }: { row: SourceRow; label?: string }) {
  return (
    <a href={row.directUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">
      {label ?? row.checkLabel}
    </a>
  );
}

function SourceRowView({ row }: { row: SourceRow }) {
  const offer = row.bestOffer;
  const attempted = `마지막 시도 ${formatKstClock(row.lastAttemptAt)}`;
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {row.rank !== undefined && <span className="mr-2 text-sm text-muted">{row.rank}위</span>}
            {row.displayName}
            <SourceBadge row={row} />
          </p>
          <p className="text-xs text-muted">{row.isDemo && (row.status === "ok" || row.status === "deals_only") ? "데모 데이터 표시 중 (실제 조회 아님)" : STATUS_TEXT[row.status]} · {attempted}</p>
          {badgeFor(row) !== "LIVE" && connectionLabel(row.provider) && <p className="text-xs text-muted">{connectionLabel(row.provider)}</p>}
        </div>
        {offer && (
          <div className="text-right">
            <p className="text-xl font-bold">{formatKrw(offer.pricePerPerson)}</p>
            {offer.seller && <p className="text-xs text-muted">판매처 {offer.seller}</p>}
            <p className="text-xs">
              {row.diffFromBest === 0 ? <span className="font-semibold text-green-700">최저가</span> : <span className="text-muted">+{formatKrw(row.diffFromBest ?? 0)}</span>}
            </p>
          </div>
        )}
      </div>

      {row.status === "ok" && offer && (
        <div className="mt-3">
          {offer.isDemo ? (
            <span className="text-xs text-muted">DEMO — 실제 예약 링크가 없어요</span>
          ) : (
            <a href={offer.bookingUrl} target="_blank" rel="noopener noreferrer sponsored" className="inline-block rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white">예약하기</a>
          )}
        </div>
      )}

      {row.status === "deals_only" && row.bestDeal && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-muted">동일 날짜 항공권 없음</p>
          <p>관련 특가 발견 <strong>{formatKrw(row.bestDeal.price)}~</strong></p>
          {row.bestDeal.isDemo ? (
            <span className="text-xs text-muted">DEMO — 실제 링크가 없어요</span>
          ) : (
            <a href={row.bestDeal.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white">특가 보기</a>
          )}
        </div>
      )}

      {row.status !== "ok" && row.status !== "deals_only" && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-medium">{row.status === "no_results" ? "현재 검색 결과 없음" : "현재 가격 확인 불가"}</p>
          {row.reason && <p className="text-xs text-muted">{row.reason}</p>}
          <CheckLink row={row} label={row.status === "no_results" ? "직접 확인" : undefined} />
        </div>
      )}

      {row.excluded && <p className="mt-2 text-xs text-amber-700">{row.reason}</p>}
    </li>
  );
}

const ORDER: Record<string, number> = { ok: 0, deals_only: 1, no_results: 2 };

/** Always renders every source — failed or manual ones are never hidden. */
export function SourceRows({ rows }: { rows: SourceRow[] }) {
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ra = a.r.rank ?? Infinity;
      const rb = b.r.rank ?? Infinity;
      return ra - rb || (ORDER[a.r.status] ?? 3) - (ORDER[b.r.status] ?? 3) || a.i - b.i;
    })
    .map((x) => x.r);
  return <ul className="space-y-2">{sorted.map((r) => <SourceRowView key={r.provider} row={r} />)}</ul>;
}
