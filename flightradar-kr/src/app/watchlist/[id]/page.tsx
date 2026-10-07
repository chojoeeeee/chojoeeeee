import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeText, Stat } from "@/components/WatchlistCard";
import { DemoBadge } from "@/components/DemoBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchlistActions } from "@/components/WatchlistActions";
import { getAirport } from "@/config/airports";
import { buildChartData } from "@/features/watchlist/chart-data";
import { backgroundNote, isDemoMode, sourceNames } from "@/features/watchlist/page-data";
import { getStore, ownerId } from "@/features/watchlist/service";
import { STATUS_TEXT, buildView } from "@/features/watchlist/view";
import { formatKrw, formatMonthDay, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const ALERT_LABEL = { TARGET_REACHED: "목표가 도달", PRICE_DROP: "가격 하락", NEW_LOW: "새 최저가", RELATED_DEAL: "관련 특가" } as const;
const STATUS_LABEL = { sent: "발송됨", dry_run: "테스트(Dry Run)", failed: "실패" } as const;

export default async function WatchlistDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const w = await store.getWatchlist(id);
  if (!w || w.userId !== ownerId()) notFound();

  const now = new Date();
  const [rows, alerts] = await Promise.all([store.listPriceHistory(w.id), store.listAlertHistory({ watchlistId: w.id, limit: 20 })]);
  const view = buildView(w, rows, now);
  const names = sourceNames();
  const chart = buildChartData(rows, names);
  const { stats, score } = view;
  const cur = stats.current;

  // Latest snapshot of each related deal found for this watchlist.
  const latestDeals = new Map<string, (typeof rows)[number]>();
  for (const r of rows.filter((x) => x.triggerType === "deal")) latestDeals.set(r.flightKey, r);
  const deals = [...latestDeals.values()].sort((a, b) => a.price - b.price);

  return (
    <div className="space-y-5">
      <Link href="/watchlist" className="text-xs text-brand underline">← 추적 목록</Link>
      <header className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
          {getAirport(w.origin)?.city ?? w.origin} → {getAirport(w.destination)?.city ?? w.destination}
          {cur?.isDemo && <DemoBadge />}
        </h1>
        <p className="text-sm text-muted">
          {formatMonthDay(w.departureDate)}{w.returnDate && ` ~ ${formatMonthDay(w.returnDate)}`} · 성인 {w.adults}명 · {STATUS_TEXT[view.statusKey]}
        </p>
      </header>

      <WatchlistActions id={w.id} enabled={w.enabled} demoMode={isDemoMode()} redirectOnDelete />
      <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-muted">{backgroundNote(now)}</p>

      <section className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-card p-4 sm:grid-cols-4">
        <Stat label="현재 (1인)" value={cur ? formatKrw(cur.price) : "-"} sub={cur ? `${names[cur.provider] ?? cur.provider}${cur.stale ? " · 참고 가격" : ""}` : undefined} />
        <Stat label="등록 당시" value={stats.registered !== undefined ? formatKrw(stats.registered) : "-"} sub={w.registeredIsDemo ? "DEMO 기준" : undefined} />
        <Stat label="변화" value={<ChangeText change={stats.changeFromRegistered} />} />
        <Stat label="목표가" value={w.targetPrice !== undefined ? formatKrw(w.targetPrice) : "미설정"} />
        <Stat label="최근 최저가" value={stats.recentLow !== undefined ? formatKrw(stats.recentLow) : "-"} sub="30일" />
        <Stat label="최근 최고가" value={stats.recentHigh !== undefined ? formatKrw(stats.recentHigh) : "-"} sub="30일" />
        <Stat label="7일 평균" value={stats.avg7 !== undefined ? formatKrw(stats.avg7) : "-"} />
        <Stat label="30일 평균" value={stats.avg30 !== undefined ? formatKrw(stats.avg30) : "-"} />
      </section>

      {score && (
        <section className="rounded-2xl border border-line bg-card p-4 text-sm">
          <h2 className="font-semibold">Deal Score</h2>
          {score.score !== undefined ? (
            <>
              <p className="mt-1 text-2xl font-bold">{score.score}<span className="text-sm font-normal text-muted">/100</span> <span className="text-base">{score.emoji} {score.label}</span></p>
              <p className="mt-1 text-xs text-muted">
                목표가 30% · 평균 대비 30% · 최근 최저가 근접 20% · 최근 하락 20% 기준 (기록이 부족한 항목은 제외하고 계산, 관측 {score.dataPoints}회){score.reference && " — 기록이 적어 참고용이에요."}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">판단할 기록이 아직 부족해요. (목표가를 설정하거나 가격이 더 쌓이면 표시돼요)</p>
          )}
        </section>
      )}

      <PriceChart chart={chart} now={now.getTime()} />

      {deals.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">🔥 관련 특가 기록</h2>
          <ul className="space-y-2">
            {deals.map((d) => (
              <li key={d.flightKey} className="rounded-xl border border-line bg-card p-3 text-sm">
                <p>
                  {names[d.provider] ?? d.provider} · <strong>{formatKrw(d.price)}~</strong> {d.sourceType === "demo" && <DemoBadge className="ml-1" />}
                </p>
                <p className="text-xs text-muted">
                  {d.departureAt && d.returnAt ? `${formatMonthDay(d.departureAt.slice(0, 10))} ~ ${formatMonthDay(d.returnAt.slice(0, 10))} · ` : ""}발견 {timeAgo(d.fetchedAt, now.getTime())}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">알림 기록</h2>
        {alerts.length === 0 ? (
          <p className="text-xs text-muted">아직 보낸 알림이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
            {alerts.map((a) => (
              <li key={a.id ?? a.sentAt + a.alertType} className="px-4 py-2">
                <p className="font-medium">
                  {ALERT_LABEL[a.alertType]} · {STATUS_LABEL[a.status]} {a.isDemo && <DemoBadge className="ml-1" />}
                </p>
                <p className="text-xs text-muted">
                  {a.oldPrice !== undefined && `${formatKrw(a.oldPrice)} → `}{a.newPrice !== undefined && formatKrw(a.newPrice)} · {timeAgo(a.sentAt, now.getTime())}
                  {a.error && ` · ${a.error}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
