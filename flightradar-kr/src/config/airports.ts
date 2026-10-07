export interface Airport {
  code: string;
  city: string;
  /** Chinese city name, used for Fliggy/FlyAI which searches by Chinese city names. */
  cityZh: string;
  cityCode: string;
  name: string;
  country: string;
}

export const AIRPORTS: Airport[] = [
  { code: "ICN", cityZh: "首尔", city: "서울", cityCode: "SEL", name: "인천국제공항", country: "KR" },
  { code: "GMP", cityZh: "首尔", city: "서울", cityCode: "SEL", name: "김포국제공항", country: "KR" },
  { code: "PUS", cityZh: "釜山", city: "부산", cityCode: "PUS", name: "김해국제공항", country: "KR" },
  { code: "TAE", cityZh: "大邱", city: "대구", cityCode: "TAE", name: "대구국제공항", country: "KR" },
  { code: "NRT", cityZh: "东京", city: "도쿄", cityCode: "TYO", name: "나리타국제공항", country: "JP" },
  { code: "HND", cityZh: "东京", city: "도쿄", cityCode: "TYO", name: "하네다공항", country: "JP" },
  { code: "KIX", cityZh: "大阪", city: "오사카", cityCode: "OSA", name: "간사이국제공항", country: "JP" },
  { code: "UKB", cityZh: "大阪", city: "오사카", cityCode: "OSA", name: "고베공항", country: "JP" },
  { code: "FUK", cityZh: "福冈", city: "후쿠오카", cityCode: "FUK", name: "후쿠오카공항", country: "JP" },
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

const KO_CITY_ALIASES: Record<string, string> = { 서울: "SEL", 인천: "ICN", 김포: "GMP", 부산: "PUS", 김해: "PUS", 대구: "TAE", 도쿄: "TYO", 동경: "TYO", 나리타: "NRT", 하네다: "HND", 오사카: "OSA", 간사이: "KIX", 후쿠오카: "FUK" };

/**
 * Resolves a free-text place label from a public page ("인천", "ICN", "도쿄(나리타)")
 * to an IATA airport code, a metro code ("TYO"), or undefined if unknown. Never guesses.
 */
export function resolvePlaceLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const t = label.trim();
  if (/^[A-Za-z]{3}$/.test(t)) return t.toUpperCase();
  const key = Object.keys(KO_CITY_ALIASES).find((k) => t.startsWith(k) || t.includes(k));
  return key ? KO_CITY_ALIASES[key] : undefined;
}
