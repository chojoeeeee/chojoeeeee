import { CHECKED_AT, SOURCE_PROFILES, type Support } from "@/config/source-profiles";
import { summarizeProviderCalls } from "@/features/watchlist/admin-stats";
import { getStore } from "@/features/watchlist/service";
import { kstDayStart, timeAgo } from "@/lib/format";
import { getSources } from "@/providers/sources";
import { DEFAULT_SCHEDULE_POLICY, type ProviderSchedulePolicy } from "@/providers/types";
import type { ProviderHealth } from "@/types/domain";

export const dynamic = "force-dynamic";

const BADGE: Record<string, { dot: string; label: string }> = {
  connected: { dot: "🟢", label: "LIVE" },
  demo: { dot: "🟡", label: "DEMO" },
  api_required: { dot: "🔵", label: "API REQUIRED" },
  partner_required: { dot: "🟣", label: "PARTNER REQUIRED" },
  manual_check: { dot: "⚪", label: "MANUAL" },
  temporary_error: { dot: "🟠", label: "ERROR" },
  unavailable: { dot: "🔴", label: "UNAVAILABLE" },
};

const SUPPORT: Record<Support, string> = { yes: "있음", no: "없음", partial: "부분", unverified: "미확인" };

async function safeHealth(name: string, fn?: () => Promise<ProviderHealth>): Promise<ProviderHealth | undefined> {
  if (!fn) return undefined;
  try {
    return await fn();
  } catch {
    return { provider: name, status: "temporary_error", message: "상태 확인 실패", checkedAt: new Date().toISOString() };
  }
}

export default async function ProvidersPage() {
  const now = new Date();
  const calls = summarizeProviderCalls(await getStore().listProviderCalls({ since: new Date(now.getTime() - 30 * 86_400_000).toISOString() }), kstDayStart(now));
  const rows = await Promise.all(
    getSources().map(async (s) => ({
      source: s,
      profile: SOURCE_PROFILES.find((p) => p.name === s.name),
      flight: await safeHealth(s.name, s.flight && (() => s.flight!.healthCheck())),
      deal: await safeHealth(s.name, s.deal && (() => s.deal!.healthCheck())),
    })),
  );
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">공급처 상태 (6개 서비스)</h1>
      <p className="text-xs text-muted">조사 기준일 {CHECKED_AT} · robots.txt는 개발 환경에서 열람 불가 → 전부 UNVERIFIED (아래 링크로 직접 확인)</p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
        {rows.map(({ source, profile, flight, deal }) => (
          <li key={source.name} className="space-y-1 px-4 py-3">
            <p className="font-semibold">{source.displayName}</p>
            {profile && <p className="text-xs">{profile.connectionLabel}</p>}
            {[["항공권 검색", flight], ["특가 Feed", deal]].map(([label, h]) => {
              const health = h as ProviderHealth | undefined;
              if (!health) return <p key={String(label)} className="text-xs text-muted">{String(label)}: 해당 없음</p>;
              const b = BADGE[health.status] ?? BADGE.unavailable!;
              return <p key={String(label)} className="text-xs text-muted">{String(label)}: {b.dot} {b.label}{health.message && ` — ${health.message}`}</p>;
            })}
            {[["항공권", source.flight?.schedulePolicy?.() ?? (source.flight ? DEFAULT_SCHEDULE_POLICY : undefined)], ["특가", source.deal?.schedulePolicy?.() ?? (source.deal ? DEFAULT_SCHEDULE_POLICY : undefined)]].map(([label, pol]) => {
              const p = pol as ProviderSchedulePolicy | undefined;
              if (!p) return null;
              return (
                <p key={String(label)} className="text-xs text-muted">
                  호출 정책({String(label)}): 사용자 검색 {p.userInitiatedSearch ? "✓" : "✗"} · 백그라운드 {p.backgroundPolling ? "✓" : "✗"}
                  {p.minimumInterval ? ` · 최소 ${Math.round(p.minimumInterval / 60_000)}분 간격` : ""} · {p.policyStatus === "confirmed" ? "근거 확인됨" : "미확인(보수적 적용)"}
                  {p.notes && ` — ${p.notes}`}
                </p>
              );
            })}
            {profile && (
              <p className="text-xs text-muted">
                공식 API {SUPPORT[profile.officialApi]} · 파트너 API {SUPPORT[profile.partnerApi]} · 공개 웹 {SUPPORT[profile.publicWeb]} · 유형 {profile.serviceType.join("/")}
              </p>
            )}
            {(() => {
              const c = calls[source.name];
              const pols = [source.flight?.schedulePolicy?.() ?? (source.flight ? DEFAULT_SCHEDULE_POLICY : undefined), source.deal?.schedulePolicy?.() ?? (source.deal ? DEFAULT_SCHEDULE_POLICY : undefined)].filter((x): x is ProviderSchedulePolicy => Boolean(x));
              const user = pols.some((p) => p.userInitiatedSearch);
              const bg = pols.some((p) => p.backgroundPolling);
              const interval = pols.map((p) => p.minimumInterval).find((x) => x !== undefined);
              return (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 p-2 text-[11px] text-muted sm:grid-cols-4">
                  <div><dt>User Search</dt><dd className="font-semibold text-fg">{user ? "허용" : "불가"}</dd></div>
                  <div><dt>Background</dt><dd className="font-semibold text-fg">{bg ? "허용" : "금지"}</dd></div>
                  <div><dt>Minimum Interval</dt><dd className="font-semibold text-fg">{interval ? `${Math.round(interval / 60_000)}분` : "-"}</dd></div>
                  <div><dt>Network Calls Today</dt><dd className="font-semibold text-fg">{c?.networkCallsToday ?? 0}</dd></div>
                  <div><dt>Last User Search</dt><dd className="font-semibold text-fg">{timeAgo(c?.lastUserSearchAt, now.getTime())}</dd></div>
                  <div><dt>Last Background Search</dt><dd className="font-semibold text-fg">{timeAgo(c?.lastBackgroundSearchAt, now.getTime())}</dd></div>
                  <div className="col-span-2"><dt>Last Error</dt><dd className="font-semibold text-fg">{c?.lastError ? `${timeAgo(c.lastError.at, now.getTime())} · ${c.lastError.message.slice(0, 80)}` : "없음"}</dd></div>
                </dl>
              );
            })()}
            {profile && <p className="text-xs text-muted">자동 조회: {profile.scheduleSummary}</p>}
            {profile && <p className="text-xs text-muted">다음 단계: {profile.nextStep}</p>}
            {profile?.publicDataChecklist && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">공개 웹 데이터 점검표 ({profile.publicDataChecklist.filter((c) => c.status === "CONFIRMED").length}/{profile.publicDataChecklist.length} 확인)</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {profile.publicDataChecklist.map((c) => (
                    <li key={c.item}>{c.item}: <strong>{c.status}</strong> — {c.note}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="flex flex-wrap gap-x-3 text-xs">
              <a href={source.checkUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">{source.checkLabel}</a>
              {profile && <a href={profile.robotsUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">robots.txt 확인</a>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
