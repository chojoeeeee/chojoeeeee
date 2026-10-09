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
}

/** Plain-language result of 다시 확인 (no technical detail). */
function describe(o: OutcomeDto): string {
  if (o.status === "throttled") return "방금 확인했어요. 잠시 후에 다시 눌러주세요.";
  if (o.status === "error") return "확인하지 못했어요. 잠시 후 다시 시도해주세요.";
  if (!o.current) return "지금은 확인된 가격이 없어요.";
  const price = `${formatKrw(o.current.price)}으로 확인했어요`;
  if (o.notified) return `${price}. 알림을 보냈어요 🔔`;
  if (o.previous !== undefined && o.current.price < o.previous) return `${price}. 이전보다 내려갔어요.`;
  if (o.previous !== undefined && o.current.price > o.previous) return `${price}. 이전보다 올랐어요.`;
  return `${price}.`;
}

const link = "text-xs font-medium text-muted underline";

export function WatchlistActions({ id, enabled, redirectOnDelete }: { id: string; enabled: boolean; redirectOnDelete?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function call(kind: string, url: string, method: string, body?: unknown) {
    setBusy(kind);
    setMessage(undefined);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { outcome?: OutcomeDto };
      if (!res.ok) setMessage("요청에 실패했어요. 잠시 후 다시 시도해주세요.");
      else if (data.outcome) setMessage(describe(data.outcome));
      return res.ok;
    } finally {
      setBusy(undefined);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <button className="h-12 w-full rounded-xl bg-brand text-base font-bold text-white disabled:opacity-60" disabled={busy !== undefined} onClick={() => call("refresh", `/api/watchlists/${id}/refresh`, "POST", {})}>
        {busy === "refresh" ? "확인 중…" : "다시 확인"}
      </button>
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
      <div className="flex justify-center gap-4">
        <button className={link} disabled={busy !== undefined} onClick={() => call("toggle", `/api/watchlists/${id}`, "PATCH", { enabled: !enabled })}>
          {enabled ? "알림 일시정지" : "알림 다시 켜기"}
        </button>
        <button
          className={link}
          disabled={busy !== undefined}
          onClick={async () => {
            if (!confirm("이 추적을 삭제할까요?")) return;
            if ((await call("delete", `/api/watchlists/${id}`, "DELETE")) && redirectOnDelete) router.push("/watchlist");
          }}
        >
          삭제
        </button>
      </div>
    </div>
  );
}
