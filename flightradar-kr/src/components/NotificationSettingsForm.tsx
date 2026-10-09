"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Settings {
  enabled: boolean;
  targetAlerts: boolean;
  newLowAlerts: boolean;
  priceDropAlerts: boolean;
  relatedDealAlerts: boolean;
}

const TOGGLES: { key: Exclude<keyof Settings, "enabled">; label: string }[] = [
  { key: "targetAlerts", label: "목표 가격에 도달했을 때" },
  { key: "newLowAlerts", label: "새 최저가가 나왔을 때" },
  { key: "priceDropAlerts", label: "가격이 크게 내려갔을 때" },
  { key: "relatedDealAlerts", label: "비슷한 일정의 특가가 나왔을 때" },
];

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-gray-300"} ${disabled ? "opacity-40" : ""}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function NotificationSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(next: Settings) {
    setS(next);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      setMsg(res.ok ? "저장했어요" : "저장하지 못했어요");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
        <span className="font-bold">알림 받기</span>
        <Switch checked={s.enabled} label="알림 받기" onChange={(v) => save({ ...s, enabled: v })} />
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {TOGGLES.map((t) => (
          <li key={t.key} className="flex items-center justify-between gap-3 p-4 text-sm">
            <span>{t.label}</span>
            <Switch checked={s[t.key]} disabled={!s.enabled} label={t.label} onChange={(v) => save({ ...s, [t.key]: v })} />
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={busy}
        className="h-12 w-full rounded-xl border border-line text-sm font-bold"
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/settings/notifications/test", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
            setMsg(res.ok ? "테스트 알림을 보냈어요" : "알림을 보내지 못했어요. 연결 상태를 확인해주세요");
          } finally {
            setBusy(false);
          }
        }}
      >
        테스트 알림 보내기
      </button>
      {msg && <p role="status" className="text-center text-sm text-muted">{msg}</p>}
    </div>
  );
}
