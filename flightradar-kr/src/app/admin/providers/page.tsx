import { getDealProviders, getFlightProviders } from "@/providers/registry";

export const dynamic = "force-dynamic";

const BADGE: Record<string, { dot: string; label: string }> = {
  connected: { dot: "🟢", label: "정상" },
  demo: { dot: "🟡", label: "DEMO" },
  api_required: { dot: "🟡", label: "API 키 필요" },
  partner_required: { dot: "🟡", label: "제휴 승인 필요" },
  temporary_error: { dot: "🟠", label: "일시 오류" },
  unavailable: { dot: "🔴", label: "연결 안 됨" },
};

export default async function ProvidersPage() {
  const providers = [
    ...getFlightProviders().map((p) => ({ kind: "항공권 검색", p })),
    ...getDealProviders().map((p) => ({ kind: "특가 Feed", p })),
  ];
  const rows = await Promise.all(
    providers.map(async ({ kind, p }) => {
      try {
        return { kind, name: p.displayName, health: await p.healthCheck() };
      } catch {
        return { kind, name: p.displayName, health: { provider: p.name, status: "temporary_error" as const, message: "상태 확인 실패", checkedAt: new Date().toISOString() } };
      }
    }),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">공급처 상태</h1>
      <p className="text-xs text-muted">오류율·평균 응답시간·오늘 요청수는 DB 로그(provider_logs)가 연결되는 Phase 2에서 표시돼요.</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
        {rows.map((r) => {
          const b = BADGE[r.health.status] ?? BADGE.unavailable!;
          return (
            <li key={r.health.provider} className="px-4 py-3">
              <p className="font-semibold">{b.dot} {r.name} <span className="ml-1 text-xs font-normal text-muted">{r.kind} · {b.label}</span></p>
              {r.health.message && <p className="text-xs text-muted">{r.health.message}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
