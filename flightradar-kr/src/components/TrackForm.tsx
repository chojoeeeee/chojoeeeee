"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKrw } from "@/lib/format";
import type { FlightSearchRequest } from "@/types/domain";

const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

/** "이 가격 추적하기": creates a watchlist for the searched route/dates. */
export function TrackForm({ request, cheapest }: { request: FlightSearchRequest; cheapest?: { price: number; isDemo: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Suggest a target 5% under the cheapest current price (rounded to 1,000 KRW), editable.
  const suggested = cheapest ? Math.floor((cheapest.price * 0.95) / 1000) * 1000 : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const target = String(fd.get("targetPrice") ?? "").replace(/[^0-9]/g, "");
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin: request.origins[0],
          destination: request.destinations[0],
          departureDate: request.departureDate,
          returnDate: request.returnDate,
          adults: request.adults,
          children: request.children,
          cabinClass: request.cabinClass,
          directOnly: request.directOnly,
          nearbyAirports: request.origins.length > 1 || request.destinations.length > 1,
          targetPrice: target ? Number(target) : undefined,
          alertPriceDropPercent: Number(fd.get("dropPercent")),
          alertNewLowest: fd.get("newLow") === "on",
          notificationChannel: "telegram",
          enabled: true,
        }),
      });
      if (!res.ok) {
        setError(res.status === 400 ? "입력값을 확인해주세요 (목표 가격은 1,000원 이상)." : "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      router.push("/watchlist");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-2xl border-2 border-brand bg-white py-3 text-base font-bold text-brand">
        🔔 이 가격 추적하기
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border-2 border-brand bg-card p-4">
      <h2 className="font-bold">가격 추적 설정</h2>
      {cheapest?.isDemo && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><strong>DEMO DATA</strong> 기준으로 추적돼요. 실제 가격이 아니에요.</p>}
      <label className="block text-xs text-muted">목표 가격 (1인, 원)
        <input name="targetPrice" inputMode="numeric" defaultValue={suggested} placeholder="예: 180000" className={field} />
        {cheapest && <span className="mt-1 block">현재 최저가 {formatKrw(cheapest.price)}</span>}
      </label>
      <label className="block text-xs text-muted">가격 하락 알림 기준
        <select name="dropPercent" defaultValue="5" className={field}>
          <option value="3">마지막 알림보다 3% 이상 더 내려가면</option>
          <option value="5">마지막 알림보다 5% 이상 더 내려가면</option>
          <option value="10">마지막 알림보다 10% 이상 더 내려가면</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="newLow" defaultChecked /> 새로운 최저가가 나오면 알림</label>
      <label className="block text-xs text-muted">알림 수단
        <select name="channel" defaultValue="telegram" className={field} disabled>
          <option value="telegram">Telegram</option>
        </select>
      </label>
      <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-muted">정책상 자동 조회가 허용되지 않는 서비스(예: Skyscanner)는 추적 목록에서 &lsquo;다시 확인&rsquo;을 눌렀을 때만 가격이 갱신돼요.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-brand py-2.5 font-semibold text-white">{busy ? "저장 중…" : "알림 시작"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-line px-4 py-2.5 text-sm">취소</button>
      </div>
    </form>
  );
}
