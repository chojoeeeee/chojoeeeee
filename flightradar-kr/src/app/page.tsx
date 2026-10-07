import { SearchForm } from "@/components/SearchForm";
import { addDays, todayKst } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function Home() {
  const today = todayKst(); // today in Korea
  const departureDate = addDays(today, 30);
  return (
    <div className="space-y-6 pt-2">
      <section>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">항공권 가격,<br />한 번에 비교하세요</h1>
        <p className="mt-2 text-sm text-muted">날짜만 넣으면 6개 사이트 가격을 모아 보여드려요.</p>
      </section>
      <section className="rounded-3xl border border-line bg-white p-4 shadow-sm">
        <SearchForm defaults={{ today, departureDate, returnDate: addDays(departureDate, 3) }} />
      </section>
    </div>
  );
}
