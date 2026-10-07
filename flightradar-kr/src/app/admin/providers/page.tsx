import { getSources } from "@/providers/sources";
import type { ProviderHealth } from "@/types/domain";

export const dynamic = "force-dynamic";

const BADGE: Record<string, { dot: string; label: string }> = {
  connected: { dot: "🟢", label: "정상" },
  demo: { dot: "🟡", label: "DEMO" },
  api_required: { dot: "🟡", label: "API 키 필요" },
  partner_required: { dot: "🟡", label: "제휴 승인 필요" },
  manual_check: { dot: "🟠", label: "직접 확인 (자동 조회 불가)" },
  temporary_error: { dot: "🟠", label: "일시 오류" },
  unavailable: { dot: "🔴", label: "연결 안 됨" },
};

async function safeHealth(name: string, fn?: () => Promise<ProviderHealth>): Promise<ProviderHealth | undefined> {
  if (!fn) return undefined;
  try {
    return await fn();
  } catch {
    return { provider: name, status: "temporary_error", message: "상태 확인 실패", checkedAt: new Date().toISOString() };
  }
}

export default async function ProvidersPage() {
  const rows = await Promise.all(
    getSources().map(async (s) => ({
      source: s,
      flight: await safeHealth(s.name, s.flight && (() => s.flight!.healthCheck())),
      deal: await safeHealth(s.name, s.deal && (() => s.deal!.healthCheck())),
    })),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">공급처 상태 (6개 서비스)</h1>
      <p className="text-xs text-muted">오류율·평균 응답시간·오늘 요청수는 DB 로그(provider_logs)가 연결되는 Phase 2에서 표시돼요.</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
        {rows.map(({ source, flight, deal }) => (
          <li key={source.name} className="space-y-1 px-4 py-3">
            <p className="font-semibold">{source.displayName}</p>
            {[["항공권 검색", flight], ["특가 Feed", deal]].map(([label, h]) => {
              const health = h as ProviderHealth | undefined;
              if (!health) return <p key={String(label)} className="text-xs text-muted">{String(label)}: 해당 없음</p>;
              const b = BADGE[health.status] ?? BADGE.unavailable!;
              return <p key={String(label)} className="text-xs text-muted">{String(label)}: {b.dot} {b.label}{health.message && ` — ${health.message}`}</p>;
            })}
            <a href={source.checkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">{source.checkLabel}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
