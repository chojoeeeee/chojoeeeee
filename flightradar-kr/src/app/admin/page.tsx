import Link from "next/link";
import { backgroundNote, isDemoMode, storeKind } from "@/features/watchlist/page-data";
import { telegramStatus } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

const LINKS: [string, string, string][] = [
  ["/admin/providers", "공급처 상태", "서비스별 연결·정책(API/파트너/백그라운드)·호출 통계·조사 근거"],
  ["/admin/watchlists", "Watchlist 상태", "개수·활성/정지·오늘 Refresh·알림·최근 오류, DEMO 가격 하락 시뮬레이션"],
  ["/admin/search", "검색 점검", "6개 서비스의 상태값·사유·건수·응답시간을 표로 확인"],
];

export default function AdminHome() {
  const tg = telegramStatus();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">관리자</h1>
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
        <div>저장소: <strong className="text-fg">{storeKind() === "postgres" ? "Postgres (Supabase)" : "메모리 — 재시작 시 추적 목록·가격 기록 초기화"}</strong></div>
        <div>Telegram: <strong className="text-fg">{tg.dryRun ? "Dry Run" : tg.ready ? "연결됨" : "연결 안 됨"}</strong> · DEMO_MODE: <strong className="text-fg">{isDemoMode() ? "켜짐 (테스트 데이터)" : "꺼짐"}</strong></div>
        <div>{backgroundNote()}</div>
      </dl>
    </div>
  );
}
