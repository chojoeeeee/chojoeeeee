import { NotificationSettingsForm } from "@/components/NotificationSettingsForm";
import { loadNotificationSettings, telegramStatus } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const settings = await loadNotificationSettings();
  const tg = telegramStatus(); // booleans only — the token and chat id never leave the server
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">알림 설정</h1>

      <section className="space-y-1 rounded-xl border border-line bg-card p-4 text-sm">
        <h2 className="font-semibold">Telegram 연결 상태</h2>
        <p className={tg.ready ? "text-green-700" : "text-amber-700"}>{tg.dryRun ? "🧪 Dry Run 모드 — 실제로 전송하지 않고 서버 로그에만 남겨요" : tg.ready ? "✅ 연결됨" : "⚠ 연결 안 됨"}</p>
        <ul className="text-xs text-muted">
          <li>TELEGRAM_BOT_TOKEN: {tg.tokenSet ? "설정됨" : "없음"}</li>
          <li>TELEGRAM_CHAT_ID: {tg.chatIdSet ? "설정됨" : "없음"}</li>
          <li>TELEGRAM_DRY_RUN: {tg.dryRun ? "true" : "false"}</li>
        </ul>
        {!tg.ready && <p className="pt-1 text-xs text-muted">연결 방법은 README의 &lsquo;Telegram 연결&rsquo;을 참고하세요. 토큰은 서버 환경변수로만 설정하며 화면에 표시되지 않아요.</p>}
      </section>

      <NotificationSettingsForm initial={settings} />
    </div>
  );
}
