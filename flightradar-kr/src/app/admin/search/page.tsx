import { toRequest, parseSearchParams } from "@/features/flight-search/schema";
import { searchAll } from "@/features/flight-search/service";
import { addDays, todayKst } from "@/lib/dates";
import { adminBadge } from "@/lib/status-labels";

export const dynamic = "force-dynamic";

/** Developer view of one search: every service with its raw status, reason, counts and timing. */
export default async function AdminSearch({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const today = todayKst();
  const dep = addDays(today, 30);
  const raw = { origin: "ICN", destination: "NRT", departureDate: dep, returnDate: addDays(dep, 3), adults: "2", ...(await searchParams) };
  const parsed = parseSearchParams(raw);
  if (!parsed.success) return <p className="text-sm text-red-600">조건 오류: {parsed.error.issues.map((i) => i.message).join(", ")}</p>;
  const result = await searchAll(toRequest(parsed.data));
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">검색 점검</h1>
      <p className="text-xs text-muted">
        {parsed.data.origin}→{parsed.data.destination} {parsed.data.departureDate}~{parsed.data.returnDate ?? "편도"} · 성인 {parsed.data.adults} · 쿼리스트링으로 조건 변경 · dataMode={result.dataMode} · 확인 {result.summary.confirmed}/{result.summary.total} (LIVE {result.summary.live})
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-soft text-muted"><tr>{["서비스", "역할", "배지", "상태", "항공권", "특가", "ms", "캐시", "사유"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {result.sources.map((s) => (
              <tr key={s.provider}>
                <td className="px-3 py-2 font-semibold">{s.displayName}</td>
                <td className="px-3 py-2">{s.role}</td>
                <td className="px-3 py-2">{adminBadge(s)}</td>
                <td className="px-3 py-2">{s.status}{s.excluded && " (excluded)"}</td>
                <td className="px-3 py-2">{s.flightCount}</td>
                <td className="px-3 py-2">{s.dealCount}</td>
                <td className="px-3 py-2">{s.elapsedMs}</td>
                <td className="px-3 py-2">{s.cached ? "Y" : ""}</td>
                <td className="px-3 py-2 text-muted">{s.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
