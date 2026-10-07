import { planBackgroundRefresh } from "@/features/alerts/background-plan";
import { adminStats } from "@/features/watchlist/admin-stats";
import { sourceNames, storeKind } from "@/features/watchlist/page-data";
import { getStore, telegramStatus } from "@/features/watchlist/service";
import { kstDayStart, timeAgo } from "@/lib/format";
import { getSources } from "@/providers/sources";

export const dynamic = "force-dynamic";

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminWatchlists() {
  const now = new Date();
  const store = getStore();
  const todayStart = kstDayStart(now);
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [watchlists, calls, alerts] = await Promise.all([store.listAllWatchlists(), store.listProviderCalls({ since }), store.listAlertHistory({ since, limit: 500 })]);
  const stats = adminStats({ watchlists, calls, alerts, todayStart });
  const plan = planBackgroundRefresh(getSources(), { now });
  const names = sourceNames();
  const tg = telegramStatus();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Watchlist 상태</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="전체 Watchlist" value={stats.total} />
        <Tile label="활성" value={stats.active} />
        <Tile label="일시정지" value={stats.paused} />
        <Tile label="오늘 알림" value={stats.alertsToday.sent} sub={stats.alertsToday.failed ? `실패 ${stats.alertsToday.failed}` : "실패 0"} />
        <Tile label="오늘 Refresh(검색 실행)" value={stats.searchesToday.user + stats.searchesToday.background} sub={`사용자 ${stats.searchesToday.user} · 백그라운드 ${stats.searchesToday.background}`} />
        <Tile label="Background 가능 Provider" value={plan.calls.length} sub={plan.calls.length === 0 ? "0개 — 자동 조회 없음 (정상)" : [...new Set(plan.calls.map((c) => names[c.provider] ?? c.provider))].join(", ")} />
      </div>

      <section className="space-y-1 rounded-xl border border-line bg-card p-4 text-xs text-muted">
        <p>저장소: <strong className="text-fg">{storeKind() === "postgres" ? "Postgres (Supabase)" : "메모리 (재시작 시 초기화)"}</strong></p>
        <p>Telegram: {tg.dryRun ? "Dry Run" : tg.ready ? "연결됨" : "연결 안 됨"} · Cron은 /api/cron/watchlists (CRON_SECRET 필요)</p>
        {plan.skipped.length > 0 && <p>백그라운드에서 제외된 Provider 부분: {plan.skipped.filter((s) => s.kind === "policy").map((s) => `${names[s.provider] ?? s.provider}(${s.part === "flight" ? "항공권" : "특가"})`).join(", ")}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">최근 오류</h2>
        {stats.recentErrors.length === 0 ? (
          <p className="text-xs text-muted">최근 7일간 오류가 없어요.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card text-xs">
            {stats.recentErrors.map((e, i) => (
              <li key={i} className="px-4 py-2"><strong>{e.source}</strong> · {timeAgo(e.at, now.getTime())}<br /><span className="text-muted">{e.message}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Watchlist 목록</h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-card text-xs">
          {watchlists.length === 0 && <li className="px-4 py-3 text-muted">없음</li>}
          {watchlists.map((w) => (
            <li key={w.id} className="px-4 py-2">
              {w.origin}→{w.destination} {w.departureDate}~{w.returnDate ?? "편도"} · {w.enabled ? "활성" : "일시정지"} · 사용자 확인 {timeAgo(w.lastUserRefreshAt, now.getTime())} · 자동 확인 {timeAgo(w.lastBackgroundRefreshAt, now.getTime())}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
