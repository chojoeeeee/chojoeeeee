import Link from "next/link";
import { backgroundNote, isDemoMode, storeKind } from "@/features/watchlist/page-data";
import { adminStats } from "@/features/watchlist/admin-stats";
import { getStore, telegramStatus } from "@/features/watchlist/service";
import { kstDayStart, timeAgo } from "@/lib/format";
import { getSources } from "@/providers/sources";

export const dynamic = "force-dynamic";

const LINKS: [string, string, string][] = [
  ["/admin/providers", "공급처 상태", "서비스별 연결·정책(API/파트너/백그라운드)·호출 통계·조사 근거"],
  ["/admin/watchlists", "Watchlist 상태", "개수·활성/정지·오늘 Refresh·알림·최근 오류, DEMO 가격 하락 시뮬레이션"],
  ["/admin/search", "검색 점검", "6개 서비스의 상태값·사유·건수·응답시간을 표로 확인"],
];

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminHome() {
  const tg = telegramStatus();
  const store = getStore();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [health, watchlists, calls, alerts, priceRows] = await Promise.all([store.health(), store.listAllWatchlists(), store.listProviderRuns({ since }), store.listAlertHistory({ since, limit: 500 }), store.countPriceRows()]);
  const stats = adminStats({ watchlists, calls, alerts, todayStart: kstDayStart(now) });
  // Latest run per provider part → status; "LIVE" = last real (network) run returned prices.
  const latest = new Map<string, (typeof calls)[number]>();
  for (const c of [...calls].sort((a, b) => a.calledAt.localeCompare(b.calledAt))) latest.set(c.provider, c);
  const liveProviders = [...latest.values()].filter((c) => c.network && c.status === "ok").length;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">관리자</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="전체 Watchlist" value={watchlists.length} sub={`활성 ${stats.active} · 정지 ${stats.paused}`} />
        <Tile label="LIVE Provider 수" value={liveProviders} sub={`전체 ${getSources().length}개 중`} />
        <Tile label="오늘 사용자 검색 횟수" value={stats.searchesToday.user} />
        <Tile label="가격 기록 수" value={priceRows} />
        <Tile label="알림 발송 수 (오늘)" value={stats.alertsToday.sent} sub={`실패 ${stats.alertsToday.failed}`} />
        <Tile label="DB 연결 상태" value={health.ok ? "정상" : "오류"} sub={health.kind === "postgres" ? "Postgres" : "메모리 (재시작 시 초기화)"} />
        <Tile label="Telegram 연결 상태" value={tg.dryRun ? "Dry Run" : tg.ready ? "연결됨" : "연결 안 됨"} />
      </div>
      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Provider 상태</h2>
        <ul className="divide-y divide-line rounded-xl border border-line bg-card text-xs">
          {getSources().map((s) => {
            const c = latest.get(s.name);
            return (
              <li key={s.name} className="px-4 py-2">
                <strong>{s.displayName}</strong> · {c ? `${c.status} · ${timeAgo(c.calledAt, now.getTime())}` : "최근 호출 없음"}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="space-y-1">
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
      <ul className="space-y-2">
        {LINKS.map(([href, title, desc]) => (
          <li key={href}>
            <Link href={href} className="block rounded-xl border border-line bg-white p-4">
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted">{desc}</p>
            </Link>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 rounded-xl bg-soft p-4 text-xs text-muted">
        <div>저장소: <strong className="text-fg">{storeKind() === "postgres" ? "Postgres (Supabase)" : "메모리 — 재시작 시 추적 목록·가격 기록 초기화"}</strong>{health.error ? ` · ${health.error}` : ""}</div>
        <div>DEMO_MODE: <strong className="text-fg">{isDemoMode() ? "켜짐 (테스트 데이터)" : "꺼짐"}</strong></div>
        <div>{backgroundNote()}</div>
      </dl>
    </div>
  );
}
