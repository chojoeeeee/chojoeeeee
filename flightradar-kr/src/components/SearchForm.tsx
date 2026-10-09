"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ORIGINS: [string, string][] = [["ICN", "서울 (인천)"], ["GMP", "서울 (김포)"], ["PUS", "부산"], ["TAE", "대구"]];
const DESTINATIONS: [string, string][] = [["NRT", "도쿄 (나리타)"], ["HND", "도쿄 (하네다)"], ["KIX", "오사카"], ["FUK", "후쿠오카"]];

const label = "mb-1 block text-xs font-medium text-muted";
const control = "h-12 w-full rounded-xl border border-line bg-white px-3 text-base";

function withExtra(list: [string, string][], code?: string): [string, string][] {
  return code && !list.some(([c]) => c === code) ? [...list, [code, code]] : list;
}

export function SearchForm({ defaults, initial }: { defaults: { departureDate: string; returnDate: string; today: string }; initial?: Record<string, string> }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [direct, setDirect] = useState(initial?.directOnly === "true");
  const [flex, setFlex] = useState(Number(initial?.flex ?? 0) > 0);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const departureDate = String(fd.get("departureDate") ?? "");
    const returnDate = String(fd.get("returnDate") ?? "");
    if (!departureDate) return setError("가는 날을 선택해주세요.");
    if (returnDate && returnDate < departureDate) return setError("오는 날은 가는 날 이후여야 해요.");
    setError(undefined);
    const q = new URLSearchParams({ origin: String(fd.get("origin")), destination: String(fd.get("destination")), departureDate, adults: String(fd.get("adults")), children: "0", cabinClass: "economy" });
    if (returnDate) q.set("returnDate", returnDate);
    if (direct) q.set("directOnly", "true");
    if (flex) q.set("flex", "3");
    router.push(`/search?${q.toString()}`);
  }

  const chip = (on: boolean) => `flex h-11 flex-1 items-center justify-center rounded-xl border text-sm font-semibold ${on ? "border-brand bg-brand-soft text-brand" : "border-line text-muted"}`;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label><span className={label}>출발지</span>
          <select name="origin" defaultValue={initial?.origin ?? "ICN"} className={control}>
            {withExtra(ORIGINS, initial?.origin).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label><span className={label}>도착지</span>
          <select name="destination" defaultValue={initial?.destination ?? "NRT"} className={control}>
            {withExtra(DESTINATIONS, initial?.destination).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label><span className={label}>출국일</span>
          <input type="date" name="departureDate" min={defaults.today} defaultValue={initial?.departureDate ?? defaults.departureDate} required className={control} />
        </label>
        <label><span className={label}>귀국일</span>
          <input type="date" name="returnDate" min={defaults.today} defaultValue={initial?.returnDate ?? defaults.returnDate} className={control} />
        </label>
      </div>

      <label className="block"><span className={label}>인원</span>
        <select name="adults" defaultValue={initial?.adults ?? "1"} className={control}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>성인 {n}명</option>)}
        </select>
      </label>

      <div className="flex gap-2">
        <button type="button" aria-pressed={direct} onClick={() => setDirect(!direct)} className={chip(direct)}>{direct ? "✓ " : ""}직항만</button>
        <button type="button" aria-pressed={flex} onClick={() => setFlex(!flex)} className={chip(flex)}>{flex ? "✓ " : ""}날짜 ±3일도 비교</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="h-14 w-full rounded-2xl bg-brand text-lg font-bold text-white shadow-sm active:opacity-90">6개 사이트 비교하기</button>
    </form>
  );
}
