"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKrw } from "@/lib/format";

interface OutcomeDto {
  status: string;
  retryAfterSeconds?: number;
  notified?: boolean;
  errors?: string[];
  current?: { price: number; isDemo: boolean };
  previous?: number;
  decisions?: { type: string; shouldNotify: boolean }[];
}

const btn = "rounded-lg border border-line px-3 py-1.5 text-xs font-semibold";

function describe(o: OutcomeDto, networkCalls?: number): string {
  if (o.status === "throttled") return `방금 확인했어요. ${o.retryAfterSeconds ?? 60}초 뒤에 다시 확인할 수 있어요.`;
  if (o.status === "error") return `확인 중 오류가 발생했어요. ${o.errors?.[0] ?? ""}`;
  if (!o.current) return "확인할 수 있는 가격이 아직 없어요. 공급처 상태를 확인해보세요.";
  const parts = [`현재 ${formatKrw(o.current.price)}${o.current.isDemo ? " (DEMO)" : ""}`];
  if (o.previous !== undefined && o.previous !== o.current.price) parts.push(`이전 ${formatKrw(o.previous)} → ${o.current.price < o.previous ? "하락" : "상승"}`);
  if (o.notified) parts.push("🔔 알림을 보냈어요");
  else if (o.decisions?.some((d) => !d.shouldNotify)) parts.push("조건은 충족했지만 중복/쿨다운으로 알림은 생략했어요");
  if (networkCalls === 0 && o.current.isDemo) parts.push("실제 네트워크 호출 없음");
  return parts.join(" · ");
}

export function WatchlistActions({ id, enabled, demoMode, redirectOnDelete }: { id: string; enabled: boolean; demoMode: boolean; redirectOnDelete?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function call(kind: string, url: string, method: string, body?: unknown) {
    setBusy(kind);
    setMessage(undefined);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { outcome?: OutcomeDto; networkCalls?: number; message?: string; error?: string };
      if (!res.ok) setMessage(data.message ?? "요청에 실패했어요.");
      else if (data.outcome) setMessage(describe(data.outcome, data.networkCalls));
      return res.ok;
    } finally {
      setBusy(undefined);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className={`${btn} bg-brand text-white`} disabled={busy !== undefined} onClick={() => call("refresh", `/api/watchlists/${id}/refresh`, "POST", {})}>
          {busy === "refresh" ? "확인 중…" : "다시 확인"}
        </button>
        <button className={btn} disabled={busy !== undefined} onClick={() => call("toggle", `/api/watchlists/${id}`, "PATCH", { enabled: !enabled })}>
          {enabled ? "일시정지" : "다시 시작"}
        </button>
        <button
          className={`${btn} text-red-700`}
          disabled={busy !== undefined}
          onClick={async () => {
            if (!confirm("이 추적을 삭제할까요? 가격 기록도 함께 삭제돼요.")) return;
            if (await call("delete", `/api/watchlists/${id}`, "DELETE") && redirectOnDelete) router.push("/watchlist");
          }}
        >
          삭제
        </button>
        {demoMode && (
          <button className={`${btn} border-amber-300 bg-amber-50 text-amber-900`} disabled={busy !== undefined} onClick={() => call("drop", `/api/watchlists/${id}/demo-drop`, "POST", {})} title="DEMO_MODE 전용: 가격이 10% 내려갔다고 가정하고 알림 흐름을 실행해요">
            🧪 DEMO 가격 하락
          </button>
        )}
      </div>
      {message && <p role="status" className="text-xs text-muted">{message}</p>}
    </div>
  );
}
