"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin/DEMO only: pretend the price dropped 10% and run the real alert pipeline. */
export function DemoDropButton({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string>();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900"
        onClick={async () => {
          const res = await fetch(`/api/watchlists/${id}/demo-drop`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          const d = (await res.json().catch(() => ({}))) as { outcome?: { notified?: boolean; current?: { price: number } }; message?: string };
          setMsg(res.ok ? `${d.outcome?.current?.price?.toLocaleString("ko-KR")}원 · ${d.outcome?.notified ? "알림 발송(또는 Dry Run)" : "알림 없음(중복/쿨다운)"}` : (d.message ?? "실패"));
          router.refresh();
        }}
      >
        🧪 DEMO 가격 하락
      </button>
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
    </span>
  );
}
