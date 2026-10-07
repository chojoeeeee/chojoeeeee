/**
 * Research record for each of the six services. Pure data (client-safe).
 * Every claim carries evidence; anything not confirmed is "unverified".
 * Last researched: see CHECKED_AT. robots.txt was NOT readable from the dev
 * environment (egress blocked) → robots status is UNVERIFIED for all six.
 */
export const CHECKED_AT = "2026-10-07";

export type ServiceType = "OTA" | "Metasearch" | "Deal Service" | "Affiliate" | "Travel Platform";
export type Support = "yes" | "no" | "partial" | "unverified";
/** Trip.com style classification (A–E) from the Phase 1.5 brief. */
export type Reachability = "A" | "B" | "C" | "D" | "E";

export interface Evidence {
  url: string;
  note: string;
}

export interface SourceProfile {
  name: string;
  /** UI/README display name. */
  displayName: string;
  /** What the service actually is. */
  officialName: string;
  officialUrl: string;
  operator?: string;
  serviceType: ServiceType[];
  flightSearch: Support;
  dealFeed: Support;
  officialApi: Support;
  partnerApi: Support;
  publicWeb: Support;
  /** How automatic lookup can work (or why it cannot yet). */
  automation: string;
  /** One-line connection state shown in the UI. */
  connectionLabel: string;
  /** What the owner must do next. */
  nextStep: string;
  reachability?: Reachability;
  robotsUrl: string;
  robotsStatus: "UNVERIFIED";
  evidence: Evidence[];
}

export const SOURCE_PROFILES: SourceProfile[] = [
  {
    name: "catchfrog",
    displayName: "캐치프로그",
    officialName: "캐치프로그 (Catchfrog) — 여행 리워드/예약 플랫폼",
    officialUrl: "https://catchfrog.ai",
    operator: "주식회사 그루누이 (GROONUI), 대표 안영빈 · catchfrog@groonui.com",
    serviceType: ["Travel Platform", "Deal Service"],
    flightSearch: "yes",
    dealFeed: "yes",
    officialApi: "unverified",
    partnerApi: "unverified",
    publicWeb: "yes",
    automation: "공식 웹(catchfrog.ai)과 앱이 존재하고 '뚝 떨어진 항공권' 특가를 제공. 공개 API/Feed는 검색에서 확인되지 않음. 자동 수집 허용 여부는 약관·robots 확인 전까지 UNVERIFIED.",
    connectionLabel: "연결 방식 조사 중 — 공식 웹 확인, 공개 API 미확인",
    nextStep: "catchfrog@groonui.com 으로 데이터/제휴 API 제공 여부 문의 + 사용자가 로컬에서 robots.txt·약관 확인",
    robotsUrl: "https://catchfrog.ai/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://catchfrog.ai/", note: "공식 웹: '캐치프로그: 뚝 떨어진 항공권' (검색 결과 제목)" },
      { url: "https://apps.apple.com/kr/app/id6737223338", note: "App Store: 특가 항공권·eSIM·호텔 예약 앱" },
      { url: "https://play.google.com/store/apps/details?id=com.groonui.instantrip", note: "Google Play (패키지 com.groonui.instantrip)" },
      { url: "https://magazine.hankyung.com/job-joy/article/202511056546d", note: "정식 런칭 기사: 운영사 ㈜그루누이, 홈페이지 catchfrog.ai, 문의 이메일" },
      { url: "https://catchfrog.ai/blog/flight-deal-sites-comparison", note: "공개 블로그 페이지 존재(콘텐츠 페이지, 가격 데이터 아님)" },
    ],
  },
  {
    name: "skyscanner",
    displayName: "Skyscanner",
    officialName: "Skyscanner (스카이스캐너) — 항공권 메타서치",
    officialUrl: "https://www.skyscanner.co.kr",
    serviceType: ["Metasearch"],
    flightSearch: "yes",
    dealFeed: "no",
    officialApi: "yes",
    partnerApi: "yes",
    publicWeb: "yes",
    automation: "공식 Flights Live Prices API(create → poll) 구현 완료. API Key만 넣으면 동작. 키는 파트너 심사 후 발급되며 독립 개발자 승인은 보장되지 않음.",
    connectionLabel: "API 연결 준비 완료 — API Key 필요",
    nextStep: "Skyscanner Partners(partners.skyscanner.net)에서 Flights Live Prices API 접근 신청 → 승인 후 SKYSCANNER_API_KEY 설정",
    robotsUrl: "https://www.skyscanner.co.kr/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://developers.skyscanner.net/docs/flights-live-prices/overview", note: "Flights Live Prices 개요 (공식 문서)" },
      { url: "https://developers.skyscanner.net/docs/getting-started/create-and-poll", note: "create/poll 방식: POST …/v3/flights/live/search/create, …/poll/{sessionToken}" },
      { url: "https://developers.skyscanner.net/docs/faqs", note: "FAQ (status/응답 구조 관련)" },
      { url: "https://developers.skyscanner.net/docs/getting-started/usage-guidelines", note: "이용 가이드라인" },
      { url: "https://ignav.com/docs/skyscanner-api-access", note: "(2차 자료) 접근은 승인된 파트너 한정, 예약 발생 목적 요구" },
    ],
  },
  {
    name: "playwings",
    displayName: "플레이윙즈 (Playwings)",
    officialName: "플레이윙즈 (Playwings) — 항공권·여행 특가 알림 서비스",
    officialUrl: "https://www.playwings.co.kr",
    operator: "(주)타이드스퀘어 · contact@playwings.co.kr",
    serviceType: ["Deal Service", "Travel Platform"],
    flightSearch: "unverified",
    dealFeed: "yes",
    officialApi: "unverified",
    partnerApi: "unverified",
    publicWeb: "yes",
    automation: "특가 콘텐츠/푸시 알림 중심(윙즈오더 24시간 한정 판매 등). 공개 특가 Feed·RSS·API는 검색에서 확인되지 않음. 앱 내부 API는 역공학하지 않음. Deal Provider로만 연결 예정.",
    connectionLabel: "특가 데이터 연결 조사 중 — 공식 Feed 미확인, 제휴 문의 필요",
    nextStep: "contact@playwings.co.kr 로 특가 데이터 제공(Feed/API/제휴) 문의 + 사용자가 로컬에서 robots.txt·이용약관 확인",
    robotsUrl: "https://www.playwings.co.kr/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://www.playwings.co.kr/banners/", note: "공식 웹 페이지(검색 결과 제목: '특가 알림으로 여행 시작')" },
      { url: "https://www.playwings.co.kr/policies/terms.html", note: "이용약관 페이지 존재 — 자동 수집 조항은 아직 열람하지 못함" },
      { url: "https://apps.apple.com/kr/app/id1050019372", note: "App Store: '매일이 여행 D-day, 플레이윙즈'" },
      { url: "https://play.google.com/store/apps/details?id=com.fridaynoons.playwings", note: "Google Play" },
      { url: "https://www.newswire.co.kr/newsRead.php?no=867530", note: "보도자료: 항공사와 실시간 항공 API 계약(공급사 측 API이며 제3자 공개 API 아님)" },
    ],
  },
  {
    name: "chulguk",
    displayName: "출국의 신",
    officialName: "출국의 신 (Godflight) — 7일 이내 출발 땡처리·취소표 항공권 모음",
    officialUrl: "https://godflight.com",
    operator: "앱 개발사 Puzzle Company, Inc. (App Store 표기, 서울)",
    serviceType: ["Deal Service"],
    flightSearch: "no",
    dealFeed: "yes",
    officialApi: "unverified",
    partnerApi: "unverified",
    publicWeb: "yes",
    automation: "공식 웹(godflight.com)에 출발 7일 이내 땡처리 목록이 공개되고 카카오톡 알림·앱 제공. 날짜 지정 검색이 아니라 큐레이션 목록이라 Deal Provider 성격. 공개 API는 확인되지 않음. 자동 수집 허용 여부 UNVERIFIED.",
    connectionLabel: "연결 방식 조사 중 — 공식 웹 확인, API 미확인",
    nextStep: "사용자가 godflight.com 의 robots.txt·약관 확인 후 허용 시 공개 목록 기반 Deal Provider 구현, 또는 운영사에 제휴 문의(Instagram @godflight_official)",
    robotsUrl: "https://godflight.com/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://godflight.com/", note: "공식 웹: '출국의 신' — 7일 이내 출발 땡처리 항공권 목록" },
      { url: "https://godflight.com/app", note: "공식 앱 안내 페이지" },
      { url: "https://apps.apple.com/kr/app/id6502391255", note: "App Store: 개발사 Puzzle Company, Inc." },
      { url: "https://play.google.com/store/apps/details?id=com.godflight.official", note: "Google Play (패키지 com.godflight.official)" },
      { url: "https://www.instagram.com/godflight_official/", note: "공식 Instagram: '땡처리 항공권 아카이빙'" },
    ],
  },
  {
    name: "ali-flight",
    displayName: "알리항공권",
    officialName: "알리익스프레스 트래블 (AliExpress Travel) 항공권 — 공급원: Alibaba Fliggy(飞猪)",
    officialUrl: "https://www.aliexpress.com",
    operator: "AliExpress (Alibaba 그룹). 항공권 공급·연동: Fliggy",
    serviceType: ["Travel Platform"],
    flightSearch: "yes",
    dealFeed: "unverified",
    officialApi: "partial",
    partnerApi: "unverified",
    publicWeb: "yes",
    automation: "AliExpress Travel 자체의 공개 API는 확인되지 않음. 공급원 Fliggy가 공식 개발자 플랫폼 FlyAI(open.fly.ai, MIT 라이선스 CLI `flyai search-flight`)를 제공 → 옵트인 어댑터 구현(CNY 가격, 환율 필요). 단 AliExpress Travel 한국 KRW 판매가와 같다는 보장은 없음.",
    connectionLabel: "Fliggy FlyAI 연결 준비 — 옵트인(ALI_PROVIDER_MODE=flyai)·환율 필요",
    nextStep: "서버에 `npm i -g @fly-ai/flyai-cli` 설치 → ALI_PROVIDER_MODE=flyai, FX_CNY_KRW 설정. FlyAI 이용약관/상업적 사용 조건은 open.fly.ai 에서 사용자가 확인",
    robotsUrl: "https://www.aliexpress.com/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://www.newsis.com/view/ALSX20250605_0000003125", note: "2025-06-05 'AliExpress Travel' 한국 정식 론칭, Fliggy 연동" },
      { url: "https://www.hankyung.com/article/202506057366g", note: "알리익스프레스 여행 사업 시작·트래블 론칭" },
      { url: "https://www.koreaherald.com/article/10503653", note: "Korea Herald: AliExpress Travel, Fliggy 파트너십" },
      { url: "https://open.fly.ai/", note: "Fliggy FlyAI 개발자 플랫폼(실시간 재고, 항공 검색, Affiliate)" },
      { url: "https://github.com/alibaba-flyai/flyai-skill", note: "공식 저장소(MIT): references/search-flight.md 에 CLI 인자·출력(JSON, CNY) 문서화" },
      { url: "https://www.npmjs.com/package/@fly-ai/flyai-cli", note: "공식 npm 패키지 @fly-ai/flyai-cli (MIT)" },
      { url: "https://kr.trip.com/flights/to-arly/airfares-arl/", note: "이름 충돌 주의: Trip.com의 '알리 항공권(ARL)'은 공항 코드 ARL 페이지로 이 서비스와 무관" },
    ],
  },
  {
    name: "trip",
    displayName: "Trip.com",
    officialName: "Trip.com (트립닷컴) — 글로벌 OTA",
    officialUrl: "https://kr.trip.com/flights/",
    serviceType: ["OTA", "Affiliate"],
    flightSearch: "yes",
    dealFeed: "no",
    officialApi: "yes",
    partnerApi: "yes",
    publicWeb: "yes",
    reachability: "B",
    automation: "공식 Flight 개발자 문서(Shopping Offer/Booking/Payment/Order/Ticketing 등)가 공개되어 있음 = 가격 조회 API가 '없는' 것이 아니라 '협약 후 자격증명 발급'. OAuth 2.0, 협약 후 product support 팀에서 appKey/appSecret 발급. 별도로 Affiliate(링크 수익) 프로그램 존재.",
    connectionLabel: "파트너 승인 필요 — Flight API 협약 후 appKey/appSecret 발급",
    nextStep: "developers.trip.com/flight 의 cooperation/product support 경로로 파트너 협약 문의(B). 보조: Affiliate 가입(C)으로 딥링크 수익화. 필드 상세 문서를 읽을 수 있게 되면 매퍼 구현",
    robotsUrl: "https://kr.trip.com/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://developers.trip.com/flight/?lang=en-US", note: "Flight Documentation: Shopping Offer Service 등 API 레퍼런스 목록" },
      { url: "https://developers.trip.com/flight/guides/authentication/?lang=en-US", note: "OAuth 2.0; 협약 후 appKey/appSecret을 product support 팀에서 발급" },
      { url: "https://developers.trip.com/flight/guides/quickStart", note: "Quick Start: Shopping→Booking→Payment→Order→Ticketing 흐름" },
      { url: "https://developers.trip.com/flight/solutions/productHandbook/?lang=en-US", note: "Product Handbook: Flight Search는 검색 조건→운임(flight group) 반환" },
      { url: "https://www.trip.com/ask/questions/trip.com-affliate-program.html", note: "Affiliate 프로그램 안내(가입 무료, 30일 쿠키, 추적 링크)" },
      { url: "https://connect.trip.com/", note: "Open platform(Connectivity): 호텔 중심 — 항공 가격 API와 별개" },
    ],
  },
];

export function getProfile(name: string): SourceProfile | undefined {
  return SOURCE_PROFILES.find((p) => p.name === name);
}
