"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatKrw } from "@/lib/format";
import type { FlightSearchRequest } from "@/types/domain";

/** Big bottom button + a small bottom sheet: set a target price, done. */
export function TrackCta({ request, cheapest, flexDays = 0 }: { request: FlightSearchRequest; cheapest?: { price: number; isDemo: boolean }; flexDays?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Suggest a target 5% under today's cheapest price, rounded down to 1,000 KRW.
  const suggested = cheapest ? Math.floor((cheapest.price * 0.95) / 1000) * 1000 : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = String(new FormData(e.currentTarget).get("targetPrice") ?? "").replace(/[^0-9]/g, "");
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
          flexibleDays: flexDays,
          targetPrice: raw ? Number(raw) : undefined,
          alertPriceDropPercent: 5,
          alertNewLowest: true,
          notificationChannel: "telegram",
          enabled: true,
        }),
      });
      if (!res.ok) {
        setError(res.status === 400 ? "목표 가격을 확인해주세요 (1,000원 이상)." : "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      router.push("/watchlist");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <button onClick={() => setOpen(true)} className="h-14 w-full rounded-2xl bg-brand text-lg font-bold text-white shadow-sm active:opacity-90">
            🔔 이 항공권 가격 알림 받기
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="가격 알림 받기" onClick={() => setOpen(false)}>
          <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} className="mx-auto w-full max-w-xl space-y-4 rounded-t-3xl bg-white p-5 pb-8">
            <div>
              <h2 className="text-xl font-extrabold">가격 알림 받기</h2>
              <p className="mt-1 text-sm text-muted">목표 가격 이하가 되면 알려드려요.</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">목표 가격 (1인, 원)</span>
              <input name="targetPrice" inputMode="numeric" defaultValue={suggested} placeholder="예: 180000" className="h-14 w-full rounded-xl border border-line px-4 text-2xl font-bold" autoFocus />
              {cheapest && <span className="mt-1 block text-xs text-muted">지금 최저가 {formatKrw(cheapest.price)}</span>}
            </label>
            {cheapest?.isDemo && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">테스트 데이터 기준으로 저장돼요.</p>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="h-14 w-full rounded-2xl bg-brand text-lg font-bold text-white disabled:opacity-60">{busy ? "저장 중…" : "알림 받기"}</button>
            <button type="button" onClick={() => setOpen(false)} className="w-full text-sm text-muted">닫기</button>
          </form>
        </div>
      )}
    </>
  );
}
