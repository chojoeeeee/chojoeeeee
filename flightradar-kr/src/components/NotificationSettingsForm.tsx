"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Settings {
  enabled: boolean;
  targetAlerts: boolean;
  newLowAlerts: boolean;
  priceDropAlerts: boolean;
  relatedDealAlerts: boolean;
  cooldownHours: number;
  minDropAmount: number;
}

const TOGGLES: { key: keyof Pick<Settings, "targetAlerts" | "newLowAlerts" | "priceDropAlerts" | "relatedDealAlerts">; label: string; hint: string }[] = [
  { key: "targetAlerts", label: "목표가 알림", hint: "설정한 목표 가격에 처음 도달했을 때" },
  { key: "newLowAlerts", label: "새 최저가 알림", hint: "지금까지 기록 중 가장 싼 가격이 나왔을 때" },
  { key: "priceDropAlerts", label: "가격 급락 알림", hint: "마지막 알림보다 5%(또는 설정 금액) 이상 더 내려갔을 때" },
  { key: "relatedDealAlerts", label: "관련 특가 알림", hint: "비슷한 일정(±3일)의 특가가 더 저렴할 때" },
];

export function NotificationSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMsg(undefined);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; dryRun?: boolean; ok?: boolean };
      return { ok: res.ok, data };
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post("/api/settings/notifications", s);
        setMsg(r.ok ? "저장했어요." : "저장하지 못했어요. 값을 확인해주세요.");
        router.refresh();
      }}
    >
      <label className="flex items-center justify-between rounded-xl border border-line bg-card p-4">
        <span>
          <span className="block font-semibold">알림 받기</span>
          <span className="text-xs text-muted">끄면 모든 알림을 보내지 않아요 (가격 기록은 계속돼요)</span>
        </span>
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-5 w-5" />
      </label>

      <div className="divide-y divide-line rounded-xl border border-line bg-card">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center justify-between p-4">
            <span>
              <span className="block text-sm font-medium">{t.label}</span>
              <span className="text-xs text-muted">{t.hint}</span>
            </span>
            <input type="checkbox" checked={s[t.key]} onChange={(e) => setS({ ...s, [t.key]: e.target.checked })} className="h-5 w-5" disabled={!s.enabled} />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-card p-4 text-sm">
        <label className="text-xs text-muted">같은 알림 재발송 대기 (시간)
          <input type="number" min={0} max={168} value={s.cooldownHours} onChange={(e) => setS({ ...s, cooldownHours: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-fg" />
        </label>
        <label className="text-xs text-muted">추가 하락 기준 금액 (원)
          <input type="number" min={0} step={1000} value={s.minDropAmount} onChange={(e) => setS({ ...s, minDropAmount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-fg" />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">저장</button>
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border border-line px-4 py-2 text-sm font-semibold"
          onClick={async () => {
            const r = await post("/api/settings/notifications/test", {});
            setMsg(r.ok ? (r.data.dryRun ? "Dry Run: 실제 전송 없이 서버 로그에 테스트 메시지를 남겼어요." : "테스트 메시지를 보냈어요. Telegram을 확인해보세요.") : `테스트 실패: ${r.data.error ?? "알 수 없는 오류"}`);
          }}
        >
          테스트 메시지 보내기
        </button>
      </div>
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </form>
  );
}
