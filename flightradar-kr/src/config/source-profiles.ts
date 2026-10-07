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

export type CheckStatus = "UNVERIFIED" | "INFERRED" | "CONFIRMED";

/** One thing we need to know before a public page may be collected automatically. */
export interface ChecklistItem {
  item: string;
  status: CheckStatus;
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
  /** Role on the result screen: real-schedule prices vs. related deals. */
  role: "flight" | "deal";
  /** Whether automatic (background) calls are allowed — see each provider's schedulePolicy(). */
  scheduleSummary: string;
  /** Structure / terms checklist for sources that publish data on a public web page. */
  publicDataChecklist?: ChecklistItem[];
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
    serviceType: ["Deal Service", "Travel Platform"],
    flightSearch: "unverified",
    dealFeed: "yes",
    officialApi: "unverified",
    partnerApi: "unverified",
    publicWeb: "yes",
    role: "deal",
    scheduleSummary: "약관·robots 확인 전: 사용자 검색 ✗ / 백그라운드 ✗ (승인 후 사용자 검색부터, 백그라운드는 별도 승인)",
    automation: "공식 웹(catchfrog.ai)에 '뚝 떨어진 항공권'(출발지·목적지·현재 가격·평균 대비 할인율)이 공개됨 → Public Web Deal Provider 후보. 일반 OTA 검색 결과와 같은 성격으로 가정하지 않고 DealProvider로 처리. 약관·robots 확인 전 자동 수집 OFF(CatchfrogDealProvider + 파서 구조만 구현).",
    connectionLabel: "공개 웹 특가(PUBLIC DEAL 후보) — 약관·robots 확인 후 수집",
    nextStep: "① 로컬 브라우저로 catchfrog.ai/robots.txt·이용약관 확인 ② 허용이면 CATCHFROG_COLLECTION_APPROVED=yes ③ 페이지 소스(view-source) 샘플을 공유하면 추출기 구현. 불확실하면 catchfrog@groonui.com 에 데이터 제공 문의",
    publicDataChecklist: [
      { item: "① 서버 렌더링 HTML 여부", status: "INFERRED", note: "검색 엔진 결과에 노선·가격·할인율 텍스트가 그대로 노출(예: 세부 257,900원 -45.0%, 후쿠오카 165,300원 -44.7%) → HTML에 포함됐을 가능성. 직접 열람 불가로 확정 못 함." },
      { item: "② 브라우저 렌더링 후 생성되는 데이터인지", status: "UNVERIFIED", note: "개발 환경에서 catchfrog.ai 접근 차단(EGRESS_BLOCKED)." },
      { item: "③ 별도 JSON endpoint", status: "UNVERIFIED", note: "개발자 도구 Network 탭 확인 필요. 앱 내부 API 역공학은 하지 않음." },
      { item: "④ pagination / filter URL", status: "UNVERIFIED", note: "목록 하단/필터 UI 확인 필요." },
      { item: "⑤ robots.txt", status: "UNVERIFIED", note: "https://catchfrog.ai/robots.txt — 사용자가 확인." },
      { item: "⑥ 이용약관의 자동 수집 허용 여부", status: "UNVERIFIED", note: "약관 문구를 검색으로 찾지 못함. 운영사 ㈜그루누이에 문의 가능." },
      { item: "⑦ 공개 데이터 갱신 주기", status: "UNVERIFIED", note: "앱 설명은 '실시간 가격 변동 분석'이나 웹 갱신 주기는 미확인 → 최소 60분 캐시로 제한." },
    ],
    robotsUrl: "https://catchfrog.ai/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://catchfrog.ai/", note: "공식 웹: '캐치프로그: 뚝 떨어진 항공권' (검색 결과 제목)" },
      { url: "https://apps.apple.com/kr/app/id6737223338", note: "App Store: 특가 항공권·eSIM·호텔 예약 앱" },
      { url: "https://play.google.com/store/apps/details?id=com.groonui.instantrip", note: "Google Play (패키지 com.groonui.instantrip)" },
      { url: "https://magazine.hankyung.com/job-joy/article/202511056546d", note: "정식 런칭 기사: 운영사 ㈜그루누이, 홈페이지 catchfrog.ai, 문의 이메일" },
      { url: "https://catchfrog.ai/blog/flight-deal-sites-comparison", note: "공개 블로그 페이지 존재(콘텐츠 페이지, 가격 데이터 아님)" },
      { url: "https://catchfrog.ai/", note: "검색 결과 스니펫에 노선·가격·평균 대비 할인율 목록이 노출(세부 257,900원 -45.0% 등) — 공개 특가 목록 근거(2026-10-07)" },
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
    publicWeb: "no",
    role: "flight",
    scheduleSummary: "Live 사용자 검색 ✓ / 백그라운드 ✗ (Usage Guidelines: 사용자 행동 없는 자동 호출 금지). Indicative·Refresh는 정책 확인 전 백그라운드 ✗",
    automation: "공식 Flights Live Prices API(create → poll) 구현 완료, 키만 넣으면 사용자 검색에서 동작. Usage Guidelines상 Live 호출은 사용자 요청에서만 → Watchlist 자동 Live 조회 금지. 날짜 탐색은 Indicative Prices 검토, Refresh는 선택한 항공편 정확도용. 공개 웹은 수집 대상 아님.",
    connectionLabel: "API 연결 준비 완료 — API Key 필요",
    nextStep: "Skyscanner Partners(partners.skyscanner.net)에서 Flights Live Prices API 접근 신청 → 승인 후 SKYSCANNER_API_KEY 설정",
    robotsUrl: "https://www.skyscanner.co.kr/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://developers.skyscanner.net/docs/flights-live-prices/overview", note: "Flights Live Prices 개요 (공식 문서)" },
      { url: "https://developers.skyscanner.net/docs/getting-started/create-and-poll", note: "create/poll 방식: POST …/v3/flights/live/search/create, …/poll/{sessionToken}" },
      { url: "https://developers.skyscanner.net/docs/faqs", note: "FAQ (status/응답 구조 관련)" },
      { url: "https://developers.skyscanner.net/docs/getting-started/usage-guidelines", note: "Usage Guidelines: Live Pricing 호출은 사용자 요청에서만, 자동 호출 없음, 정확한 노선·날짜가 있을 때만 (검색 스니펫 기준 2026-10-07)" },
      { url: "https://developers.skyscanner.net/docs/flights-live-prices/refresh-prices", note: "Refresh Prices: 선택한 itinerary의 최신가(itineraryrefresh create/poll, 캐시 TTL 약 10분). 모니터링 API로 명시되지 않음" },
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
    publicWeb: "unverified",
    role: "deal",
    scheduleSummary: "확인 전: 사용자 검색 ✗ / 백그라운드 ✗",
    automation: "특가 콘텐츠/푸시 알림 중심(윙즈오더 24시간 한정 판매 등). 공개 특가 Feed·RSS·API는 검색에서 확인되지 않음(재조사 항목은 아래 점검표). 앱 내부 API는 역공학하지 않음. Deal Provider로만 연결 예정.",
    publicDataChecklist: [
      { item: "공개 특가 Feed", status: "UNVERIFIED", note: "검색에서 찾지 못함." },
      { item: "앱이 쓰는 공개 API", status: "UNVERIFIED", note: "공식 공개 API 문서를 찾지 못함. 앱 내부 API 역공학·인증 우회는 하지 않음." },
      { item: "공식 Web 페이지", status: "CONFIRMED", note: "https://www.playwings.co.kr (배너/프로모션 페이지 /banners/ 존재) — 특가 목록 페이지 구조는 미확인." },
      { item: "공유 가능한 Deal URL", status: "UNVERIFIED", note: "개별 특가의 공개 공유 링크 형식 미확인." },
      { item: "RSS", status: "UNVERIFIED", note: "검색에서 찾지 못함." },
      { item: "Partner API / Affiliate", status: "UNVERIFIED", note: "문의 필요: contact@playwings.co.kr (항공사와의 API 계약은 공급 측 이야기이며 제3자 공개 API 근거가 아님)." },
      { item: "공개 JSON endpoint", status: "UNVERIFIED", note: "개발자 도구로 사용자 확인 필요." },
      { item: "robots.txt / 이용약관", status: "UNVERIFIED", note: "robots 미열람. 약관 페이지(/policies/terms.html) 존재 — 자동 수집 조항 미열람." },
    ],
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
    role: "deal",
    scheduleSummary: "약관·robots 확인 전: 사용자 검색 ✗ / 백그라운드 ✗ (승인 후 사용자 검색부터, 백그라운드는 별도 승인)",
    automation: "공식 웹(godflight.com)에 출발 임박 특가 목록(출발지·도착지·가격·D-Day·출발/도착 날짜·요일·여행 기간)이 공개됨 → Public Web Deal Provider 후보. 날짜 검색이 아닌 '출발 임박 특가'라 FlightSearch가 아니라 DealProvider(GodFlightDealProvider). 사용자 검색과는 노선·날짜·여행 기간 유사도로 매칭하고 일반 가격 순위에는 넣지 않음. 약관·robots 확인 전 수집 OFF.",
    connectionLabel: "공개 웹 특가(PUBLIC DEAL 후보) — 약관·robots 확인 후 수집",
    nextStep: "① 로컬 브라우저로 godflight.com/robots.txt·약관 확인 ② 허용이면 GODFLIGHT_COLLECTION_APPROVED=yes ③ 페이지 소스 샘플을 공유하면 추출기 구현. 불확실하면 운영사에 제휴 문의(Instagram @godflight_official)",
    publicDataChecklist: [
      { item: "① 서버 렌더링 HTML 여부", status: "UNVERIFIED", note: "godflight.com 접근 차단(EGRESS_BLOCKED)으로 HTML 구조 미확인. 홈페이지에 7일 이내 출발 특가 목록이 표시된다는 설명만 확인." },
      { item: "② 브라우저 렌더링 후 생성되는 데이터인지", status: "UNVERIFIED", note: "사용자 확인 필요(view-source vs 렌더 결과 비교)." },
      { item: "③ 별도 JSON endpoint", status: "UNVERIFIED", note: "개발자 도구 Network 탭 확인 필요. 앱 내부 API 역공학은 하지 않음." },
      { item: "④ pagination / filter URL", status: "UNVERIFIED", note: "앱은 출발 공항(ICN/GMP/PUS/TAE) 필터와 달력 보기를 제공한다고 알려짐 — 웹 URL 형식 미확인." },
      { item: "⑤ robots.txt", status: "UNVERIFIED", note: "https://godflight.com/robots.txt — 사용자가 확인." },
      { item: "⑥ 이용약관의 자동 수집 허용 여부", status: "UNVERIFIED", note: "약관 문구를 찾지 못함." },
      { item: "⑦ 공개 데이터 갱신 주기", status: "INFERRED", note: "새 특가가 올라오면 카카오톡/앱 알림을 보낸다고 하므로 수시 갱신으로 추정 → 최소 60분 캐시로 제한." },
    ],
    robotsUrl: "https://godflight.com/robots.txt",
    robotsStatus: "UNVERIFIED",
    evidence: [
      { url: "https://godflight.com/", note: "공식 웹: '출국의 신' — 7일 이내 출발 땡처리 항공권 목록" },
      { url: "https://godflight.com/app", note: "공식 앱 안내 페이지" },
      { url: "https://apps.apple.com/kr/app/id6502391255", note: "App Store: 개발사 Puzzle Company, Inc." },
      { url: "https://play.google.com/store/apps/details?id=com.godflight.official", note: "Google Play (패키지 com.godflight.official)" },
      { url: "https://www.instagram.com/godflight_official/", note: "공식 Instagram: '땡처리 항공권 아카이빙'" },
      { url: "https://godflight.com/", note: "홈페이지가 출발 7일 이내 할인 항공권 목록을 보여주고 카카오톡 알림 버튼 제공(검색 결과 요약, 2026-10-07)" },
    ],
  },
  {
    name: "ali-flight",
    displayName: "알리항공권",
    officialName: "알리익스프레스 트래블 (AliExpress Travel) 항공권 — 공급원: Alibaba Fliggy(飞猪)",
    officialUrl: "https://www.aliexpress.com",
    operator: "AliExpress (Alibaba 그룹). 항공권 공급·연동: Fliggy",
    serviceType: ["Travel Platform"],
    flightSearch: "partial",
    dealFeed: "unverified",
    officialApi: "partial",
    partnerApi: "unverified",
    publicWeb: "unverified",
    role: "flight",
    scheduleSummary: "FlyAI는 실험적: 사용자 검색만 ✓(옵트인) / 백그라운드 ✗ — 정확한 이용 조건 확인 필요",
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
    publicWeb: "unverified",
    role: "flight",
    scheduleSummary: "사용자 검색 ✓(협약 후) / 백그라운드: 협약 조건 확인 필요 → 확인 전 ✗",
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
