import type { SourceRow, SourceStatus } from "@/features/flight-search/result";
import { formatKrw, formatKstClock } from "@/lib/format";
import { DealCard } from "./RelatedDeals";
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
  policy_skipped: "⏸ 정책상 자동 조회 안 함",
};

const HAS_DATA: SourceStatus[] = ["ok", "deals_only", "no_results"];

function CheckLink({ row, label }: { row: SourceRow; label?: string }) {
  return (
    <a href={row.directUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand">
      {label ?? row.checkLabel}
    </a>
  );
}

function Header({ row, right }: { row: SourceRow; right?: React.ReactNode }) {
  const demoData = row.isDemo && (row.status === "ok" || row.status === "deals_only");
  const statusText = demoData ? "데모 데이터 표시 중 (실제 조회 아님)" : row.role === "deal" && row.status === "ok" ? "✓ 특가 조회 성공" : STATUS_TEXT[row.status];
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-semibold">
          {row.role === "flight" && row.rank !== undefined && <span className="mr-2 text-sm text-muted">{row.rank}위</span>}
          {row.displayName}
          <SourceBadge row={row} />
        </p>
        <p className="text-xs text-muted">{statusText} · 마지막 시도 {formatKstClock(row.lastAttemptAt)}</p>
        {badgeFor(row) !== "LIVE" && badgeFor(row) !== "PUBLIC DEAL" && connectionLabel(row.provider) && <p className="text-xs text-muted">{connectionLabel(row.provider)}</p>}
      </div>
      {right}
    </div>
  );
}

function Unavailable({ row }: { row: SourceRow }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="font-medium">{row.status === "no_results" ? "현재 검색 결과 없음" : row.status === "policy_skipped" ? "자동 조회 대상이 아니에요" : "현재 가격 확인 불가"}</p>
      {row.reason && <p className="text-xs text-muted">{row.reason}</p>}
      <CheckLink row={row} label={row.status === "no_results" ? "직접 확인" : undefined} />
    </div>
  );
}

function FlightRow({ row }: { row: SourceRow }) {
  const offer = row.bestOffer;
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <Header
        row={row}
        right={
          offer && (
            <div className="text-right">
              <p className="whitespace-nowrap text-xl font-bold">{formatKrw(offer.pricePerPerson)}</p>
              {offer.seller && <p className="text-xs text-muted">판매처 {offer.seller}</p>}
              <p className="text-xs">{row.diffFromBest === 0 ? <span className="font-semibold text-green-700">최저가</span> : <span className="text-muted">+{formatKrw(row.diffFromBest ?? 0)}</span>}</p>
            </div>
          )
        }
      />
      {row.status === "ok" && offer && (
        <div className="mt-3">
          {offer.isDemo ? (
            <span className="text-xs text-muted">DEMO — 실제 예약 링크가 없어요</span>
          ) : (
            <a href={offer.bookingUrl} target="_blank" rel="noopener noreferrer sponsored" className="inline-block rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white">예약하기</a>
          )}
        </div>
      )}
      {!(row.status === "ok" && offer) && <Unavailable row={row} />}
      {row.excluded && <p className="mt-2 text-xs text-amber-700">{row.reason}</p>}
    </li>
  );
}

function DealRow({ row }: { row: SourceRow }) {
  const hasData = HAS_DATA.includes(row.status);
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <Header row={row} />
      {hasData && row.related.length > 0 && (
        <div className="mt-3 space-y-2">
          {row.related.map((r) => (
            <DealCard key={r.deal.id} related={r} />
          ))}
        </div>
      )}
      {hasData && row.related.length === 0 && (
        <p className="mt-3 text-sm text-muted">{row.bestDeal ? "공개된 특가는 있지만 선택한 노선·일정과 맞는 특가는 없어요." : "현재 일정과 관련된 특가가 없어요."}</p>
      )}
      {!hasData && <Unavailable row={row} />}
      {row.excluded && <p className="mt-2 text-xs text-amber-700">{row.reason}</p>}
    </li>
  );
}

const ORDER: Record<string, number> = { ok: 0, deals_only: 1, no_results: 2 };

/** Always renders every source of the given role — failed or manual ones are never hidden. */
export function SourceRows({ rows, role }: { rows: SourceRow[]; role: "flight" | "deal" }) {
  const sorted = rows
    .filter((r) => r.role === role)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ra = a.r.rank ?? Infinity;
      const rb = b.r.rank ?? Infinity;
      const da = a.r.related.length > 0 ? 0 : 1;
      const db = b.r.related.length > 0 ? 0 : 1;
      return ra - rb || da - db || (ORDER[a.r.status] ?? 3) - (ORDER[b.r.status] ?? 3) || a.i - b.i;
    })
    .map((x) => x.r);
  return <ul className="space-y-2">{sorted.map((r) => (r.role === "flight" ? <FlightRow key={r.provider} row={r} /> : <DealRow key={r.provider} row={r} />))}</ul>;
}
