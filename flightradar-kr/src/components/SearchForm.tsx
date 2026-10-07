"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const field = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export function SearchForm({ initial }: { initial?: Record<string, string> }) {
  const router = useRouter();
  const [error, setError] = useState<string>();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const departureDate = String(fd.get("departureDate") ?? "");
    const returnDate = String(fd.get("returnDate") ?? "");
    if (!departureDate) return setError("가는 날을 선택해주세요.");
    if (returnDate && returnDate < departureDate) return setError("오는 날은 가는 날 이후여야 해요.");
    setError(undefined);

    const q = new URLSearchParams();
    q.set("origin", String(fd.get("origin")).toUpperCase());
    q.set("destination", String(fd.get("destination")).toUpperCase());
    q.set("departureDate", departureDate);
    if (returnDate) q.set("returnDate", returnDate);
    q.set("adults", String(fd.get("adults")));
    q.set("cabinClass", String(fd.get("cabinClass")));
    if (fd.get("nearby")) q.set("nearby", "true");
    if (fd.get("directOnly")) q.set("directOnly", "true");
    router.push(`/search?${q.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted">출발지 (공항 코드)
          <input name="origin" defaultValue={initial?.origin ?? "ICN"} required maxLength={3} className={field} />
        </label>
        <label className="text-xs text-muted">도착지 (공항 코드)
          <input name="destination" defaultValue={initial?.destination ?? "NRT"} required maxLength={3} className={field} />
        </label>
        <label className="text-xs text-muted">가는 날
          <input type="date" name="departureDate" defaultValue={initial?.departureDate ?? "2026-11-12"} required className={field} />
        </label>
        <label className="text-xs text-muted">오는 날
          <input type="date" name="returnDate" defaultValue={initial?.returnDate ?? "2026-11-15"} className={field} />
        </label>
        <label className="text-xs text-muted">인원 (성인)
          <input type="number" name="adults" min={1} max={9} defaultValue={initial?.adults ?? "2"} className={field} />
        </label>
        <label className="text-xs text-muted">좌석
          <select name="cabinClass" defaultValue={initial?.cabinClass ?? "economy"} className={field}>
            <option value="economy">이코노미</option>
            <option value="premium_economy">프리미엄 이코노미</option>
            <option value="business">비즈니스</option>
            <option value="first">일등석</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" name="nearby" defaultChecked={initial?.nearby === "true"} /> 주변 공항 포함</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="directOnly" defaultChecked={initial?.directOnly === "true"} /> 직항만</label>
        <label className="flex items-center gap-1.5 text-muted" title="Phase 3에서 제공됩니다"><input type="checkbox" disabled /> 날짜 ±3일 (준비 중)</label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="w-full rounded-xl bg-brand py-3 font-semibold text-white">최저가 찾기</button>
    </form>
  );
}
