import { SearchForm } from "@/components/SearchForm";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="space-y-2 pt-2">
        <h1 className="text-2xl font-bold leading-snug">항공권 가격,<br />매일 검색하지 마세요.</h1>
        <p className="text-sm text-muted">여행 날짜만 넣으면 가장 싼 항공권을 찾아드려요.</p>
      </section>
      <SearchForm />
      <section className="grid gap-3 sm:grid-cols-3">
        {["🔥 오늘 특가", "👀 추적 중", "📉 최근 가격 하락"].map((t) => (
          <div key={t} className="rounded-xl border border-dashed border-line bg-card p-4 text-sm">
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-muted">준비 중이에요. (가격 추적은 다음 단계에서 제공돼요)</p>
          </div>
        ))}
      </section>
    </div>
  );
}
