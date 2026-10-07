import { CHECKED_AT, SOURCE_PROFILES, type Support } from "@/config/source-profiles";
import { getSources } from "@/providers/sources";
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
            {profile && (
              <p className="text-xs text-muted">
                공식 API {SUPPORT[profile.officialApi]} · 파트너 API {SUPPORT[profile.partnerApi]} · 공개 웹 {SUPPORT[profile.publicWeb]} · 유형 {profile.serviceType.join("/")}
              </p>
            )}
            {profile && <p className="text-xs text-muted">다음 단계: {profile.nextStep}</p>}
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
