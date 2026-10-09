import type { ProviderSchedulePolicy } from "../types";

/**
 * Skyscanner call policies — one per API product, because their terms differ.
 * Source: Skyscanner developer docs (checked 2026-10-07):
 *  - Usage Guidelines: "Live Pricing Service calls are only made on user-generated
 *    requests"; automated requests (calls without user action) do not occur; a call is made
 *    only when the exact origin/destination pair and dates are known.
 *    https://developers.skyscanner.net/docs/getting-started/usage-guidelines
 *  - Refresh Prices: /itineraryrefresh/create + /poll for a SELECTED itinerary (needs the
 *    search session token + itinerary id); prices are cached ~10 min; recommended for price
 *    accuracy before booking. It is NOT described as a monitoring API.
 *    https://developers.skyscanner.net/docs/flights-live-prices/refresh-prices
 */
export const SKYSCANNER_LIVE_POLICY: ProviderSchedulePolicy = {
  userInitiatedSearch: true,
  backgroundPolling: false,
  policyStatus: "confirmed",
  notes: "Live Prices는 사용자가 정확한 노선·날짜로 검색했을 때만 호출. Cron/Watchlist 자동 호출 금지(Usage Guidelines).",
};

export const SKYSCANNER_INDICATIVE_POLICY: ProviderSchedulePolicy = {
  userInitiatedSearch: true,
  backgroundPolling: false,
  policyStatus: "unverified",
  notes: "Indicative(캐시 가격, 날짜 탐색용)의 자동 호출 허용 여부는 파트너 계약으로 확인되기 전까지 금지. 사용자가 탐색/Flexible 검색을 눌렀을 때만 검토.",
};

export const SKYSCANNER_REFRESH_POLICY: ProviderSchedulePolicy = {
  userInitiatedSearch: true,
  backgroundPolling: false,
  policyStatus: "unverified",
  notes: "Itinerary Refresh는 사용자가 항공편을 선택했을 때 가격 정확도를 높이는 용도. 장기 백그라운드 모니터링으로 해석하지 않음(파트너 정책 확인 전까지 금지).",
};
