export interface Airport {
  code: string;
  city: string;
  cityCode: string;
  name: string;
  country: string;
}

export const AIRPORTS: Airport[] = [
  { code: "ICN", city: "서울", cityCode: "SEL", name: "인천국제공항", country: "KR" },
  { code: "GMP", city: "서울", cityCode: "SEL", name: "김포국제공항", country: "KR" },
  { code: "PUS", city: "부산", cityCode: "PUS", name: "김해국제공항", country: "KR" },
  { code: "NRT", city: "도쿄", cityCode: "TYO", name: "나리타국제공항", country: "JP" },
  { code: "HND", city: "도쿄", cityCode: "TYO", name: "하네다공항", country: "JP" },
  { code: "KIX", city: "오사카", cityCode: "OSA", name: "간사이국제공항", country: "JP" },
  { code: "UKB", city: "오사카", cityCode: "OSA", name: "고베공항", country: "JP" },
  { code: "FUK", city: "후쿠오카", cityCode: "FUK", name: "후쿠오카공항", country: "JP" },
];

const byCode = new Map(AIRPORTS.map((a) => [a.code, a]));

export function getAirport(code: string): Airport | undefined {
  return byCode.get(code.toUpperCase());
}

/** All airports serving the same metro area as `code` (including itself). */
export function nearbyAirports(code: string): string[] {
  const a = getAirport(code);
  if (!a) return [code.toUpperCase()];
  return AIRPORTS.filter((x) => x.cityCode === a.cityCode).map((x) => x.code);
}

/** Fixed UTC offsets (minutes). KR and JP do not observe DST. */
const COUNTRY_OFFSET_MIN: Record<string, number> = { KR: 540, JP: 540 };

export function airportOffsetMinutes(code: string): number | undefined {
  const a = getAirport(code);
  return a ? COUNTRY_OFFSET_MIN[a.country] : undefined;
}
