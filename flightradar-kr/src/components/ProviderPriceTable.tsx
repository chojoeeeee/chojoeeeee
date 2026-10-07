import type { ProviderPrice } from "@/features/flight-search/compare";
import { formatKrw } from "@/lib/format";

export function ProviderPriceTable({ prices, names }: { prices: ProviderPrice[]; names: Record<string, string> }) {
  return (
    <ol className="divide-y divide-line rounded-xl border border-line bg-card text-sm">
      {prices.map((p) => (
        <li key={p.provider} className="flex items-center justify-between px-4 py-2">
          <span><span className="mr-2 text-muted">{p.rank}위</span>{names[p.provider] ?? p.provider}</span>
          <span className="font-semibold">{formatKrw(p.offer.pricePerPerson)}</span>
        </li>
      ))}
    </ol>
  );
}
