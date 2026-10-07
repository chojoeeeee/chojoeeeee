import { NotificationSettingsForm } from "@/components/NotificationSettingsForm";
import { loadNotificationSettings, telegramStatus } from "@/features/watchlist/service";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const settings = await loadNotificationSettings();
  const tg = telegramStatus(); // flags only — token and chat id never leave the server
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">알림 설정</h1>
      <p className={`rounded-2xl p-4 text-sm font-medium ${tg.ready ? "bg-green-50 text-green-800" : "bg-soft text-muted"}`}>
        {tg.ready ? "✓ 알림을 받을 수 있어요" : "알림을 받을 준비가 아직 안 됐어요"}
      </p>
      <NotificationSettingsForm
        initial={{ enabled: settings.enabled, targetAlerts: settings.targetAlerts, newLowAlerts: settings.newLowAlerts, priceDropAlerts: settings.priceDropAlerts, relatedDealAlerts: settings.relatedDealAlerts }}
      />
    </div>
  );
}
