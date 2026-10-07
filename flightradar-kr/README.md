# FlightRadar KR · 항공권 특가 레이더

여러 항공권 서비스의 가격을 한 곳에서 비교하고, 원하는 날짜·노선의 가격을 추적해 좋은 가격이 나왔을 때 알려주는 개인용 항공권 가격 추적 프로그램.

> **핵심 원칙: 데이터 공급처 하나가 사라져도 프로그램 전체는 영향을 받지 않는다.**
> 모든 공급처는 `Provider Adapter` 뒤에 있고, 검색은 `Promise.allSettled` + 타임아웃으로 격리된다.

> 이 폴더는 GitHub 프로필 저장소(`chojoeeeee/chojoeeeee`) 안에 있으므로 루트의 프로필 `README.md`와 분리하기 위해 `flightradar-kr/` 하위에 만들었다. 별도 저장소로 옮길 때는 폴더째 이동하면 된다.

## 개발 현황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트/DB 스키마/검색 UI/Provider Adapter/가격 비교 + **6개 서비스 전부 조회** | 구현됨 |
| 1.5 | **실제 Provider 연동 조사·구현** (Skyscanner 완성, FlyAI 옵트인, 근거 기록) | **구현됨 (승인 대기)** |
| 2 | Watchlist, 가격 저장, 가격 그래프, Cron/스케줄러, Telegram 알림, 목표가·최저가 갱신 알림 | 미착수 (승인 필요) |
| 3 | 날짜 ±N일 비교, 최저가 캘린더, 실제 Provider 연동(승인 후), 특가 Feed 연동 | 미착수 |
| 4 | Deal Score, 가격 분석, 여행지 미정 검색, Web Push | 미착수 |

### MVP 완료 조건 (12개) 진행 현황

| # | 조건 | 상태 |
|---|---|---|
| 1 | 6개 Provider 모두 등록 | ✅ `src/providers/sources.ts` (테스트로 고정) |
| 2 | 검색 시 6개 모두 조회 시도 | ✅ 소스별 `/api/search/source` 병렬 호출 + `Promise.allSettled` |
| 3 | 각 Provider 상태 화면 표시 | ✅ 진행상태 + 결과 6행(성공/특가/결과없음/직접확인/오류…) |
| 4 | 연결 가능한 Provider는 실제 데이터 | ⏳ Skyscanner는 키만 넣으면 LIVE(코드·테스트 완료, 실키 미검증), 알리항공권은 FlyAI 옵트인. **현재 키/승인이 없어 LIVE 0개** |
| 5 | 자동 연결 불가 Provider의 이유·상태 표시 | ✅ `manual_check` + 사유 + 직접 확인 링크 |
| 6 | 동일 기준 가격 비교 | ✅ KRW·1인 기준 정규화, 순위·가격차 |
| 7 | 최저가 자동 계산 | ✅ |
| 8 | 관련 특가 함께 표시 | ✅ 구조·UI 완료 (실제 특가 소스는 미연결, DEMO로만 확인) |
| 9 | Watchlist 저장 | ❌ Phase 2 |
| 10 | 6개 Provider 재조회 | ◐ 화면의 "다시 조회"는 가능, 스케줄러 재조회는 Phase 2 |
| 11 | 새 최저가 알림 | ❌ Phase 2 |
| 12 | 모바일 사용 | ✅ 390px 뷰포트 확인 (가로 넘침 없음) |

## 아키텍처

네 개의 엔진을 강하게 분리한다.

| 엔진 | 역할 | 위치 | Phase |
|---|---|---|---|
| Search Engine | 6개 소스 병렬 조회(항공권+특가), 캐시, 장애 격리 | `src/features/flight-search/engine.ts` | 1 |
| Comparison Engine | 정규화, 중복 제거, Provider별 비교, Smart Score, 추천 | `src/features/flight-search/{normalize,compare}.ts` | 1 |
| Deal Engine | "정말 싼 가격인가?" 판정 (Deal Score) | `src/features/deal-engine/` | 4 |
| Alert Engine | 중복 방지 포함 알림 발송 | `src/features/alerts/` | 2 |

```
UI (Server/Client Components)
        │
   /api/search  ·  /search (Server Component)
        │
  Search Engine ── cache(search_hash) ── Provider Registry
        │                                     │
  Promise.allSettled + timeout        ┌───────┼────────────────┐
        │                         FlightProvider           DealProvider
  Comparison Engine            (skyscanner, trip,        (catchfrog, playwings,
                                mock-a, mock-b)           chulguk, ali-flight)
```

* **FlightProvider** = 일반 항공권 검색 결과(`FlightOffer`). **DealProvider** = 프로모션/특가 게시글(`TravelDeal`). 두 데이터는 별도 모델·별도 테이블로 관리한다.
* Provider 상태: `connected` · `api_required` · `partner_required` · `unavailable` · `temporary_error` (+ 개발용 `demo`).
* **DEMO DATA**: mock에서 나온 `FlightOffer`는 `isDemo: true`이며 UI에 항상 `DEMO DATA` 배지가 표시된다. 실제 데이터와 mock 데이터는 같은 결과 목록에 섞이지 않도록 구분 표시된다. 실제 가격을 임의로 생성하지 않는다.
* 서비스 보호 장치(CAPTCHA, 로그인, anti-bot) 우회는 구현하지 않는다. 공식 API/제휴가 확인되지 않은 서비스는 Adapter + Mock(또는 `unavailable`)만 제공한다.

## 최우선 요구사항: 6개 서비스 모두 조회

캐치프로그 · Skyscanner · Playwings · 출국의 신 · 알리항공권 · Trip.com **6개 소스는 항상 등록되고, 검색할 때마다 모두 조회를 시도하며, 결과 화면에 항상 6개가 모두 표시된다.** 자동 조회가 불가능한 소스도 제거하지 않고 상태(`manual_check` 등)·이유·직접 확인 링크를 보여준다. 구현: `src/providers/sources.ts` (6개 고정), `src/features/flight-search/engine.ts`.

## 서비스 조사 결과 (Phase 1.5)

조사 기준일 **2026-10-07**. 근거는 웹 검색 결과와 공식 저장소(GitHub/npm) 열람이다.

> **조사 한계**: 개발 환경의 네트워크 정책으로 `developers.skyscanner.net`, `developers.trip.com`, `catchfrog.ai`, `playwings.co.kr` 등 공식 페이지와 모든 `robots.txt`를 **직접 열람하지 못했다.** (환경 설정에서 해당 도메인을 허용하면 필드 단위 문서를 읽고 구현을 마저 할 수 있다.) 아래 표의 "확인"은 검색 결과·공식 저장소로 확인된 것이고, 읽지 못한 약관/robots는 `UNVERIFIED`다. **확인되지 않은 것은 추측으로 구현하지 않았다.**

### A. 6개 서비스 최종 조사표

| Provider | 정확한 서비스 | 공식 URL | 서비스 유형 | Flight Search | Deal Feed | 공식 API | Partner API | 공개 Web | 자동화 가능성 | 현재 상태 | 근거 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 캐치프로그 | 캐치프로그(Catchfrog) 여행 리워드·예약 플랫폼, 운영사 **㈜그루누이** | https://catchfrog.ai | Travel Platform, Deal Service | 있음(앱/웹 비교·예약) | 있음("뚝 떨어진 항공권") | 미확인 | 미확인 | 있음 | 공개 API 미확인, 약관/robots UNVERIFIED | **MANUAL** (연결 방식 조사 중) | [catchfrog.ai](https://catchfrog.ai/) · [App Store](https://apps.apple.com/kr/app/id6737223338) · [Google Play](https://play.google.com/store/apps/details?id=com.groonui.instantrip) · [한경 기사](https://magazine.hankyung.com/job-joy/article/202511056546d) |
| Skyscanner | 스카이스캐너 항공권 메타서치 | https://www.skyscanner.co.kr | Metasearch | 있음 | 없음 | **있음** (Flights Live/Indicative) | 있음(승인제) | 있음 | **API Key로 가능** (create→poll 구현 완료) | **API REQUIRED** (API 연결 준비 완료) | [Live Prices 개요](https://developers.skyscanner.net/docs/flights-live-prices/overview) · [Create and poll](https://developers.skyscanner.net/docs/getting-started/create-and-poll) · [FAQ](https://developers.skyscanner.net/docs/faqs) |
| 플레이윙즈 (Playwings) | 항공권·여행 특가 알림 서비스, 운영사 **㈜타이드스퀘어** | https://www.playwings.co.kr | Deal Service, Travel Platform | 미확인 | 있음(특가 콘텐츠·푸시, 윙즈오더) | 미확인 | 미확인 | 있음 | 공개 Feed/API 미확인, 약관 UNVERIFIED | **MANUAL** (특가 데이터 연결 조사 중) | [공식 웹](https://www.playwings.co.kr/banners/) · [이용약관](https://www.playwings.co.kr/policies/terms.html) · [App Store](https://apps.apple.com/kr/app/id1050019372) · [보도자료](https://www.newswire.co.kr/newsRead.php?no=867530) |
| 출국의 신 | 출국의 신(Godflight) — 7일 이내 출발 땡처리·취소표 모음, 앱 개발사 Puzzle Company, Inc. | https://godflight.com | Deal Service | **없음**(날짜 검색이 아닌 큐레이션 목록) | 있음 | 미확인 | 미확인 | 있음 | 공개 API 미확인, 약관/robots UNVERIFIED | **MANUAL** (연결 방식 조사 중) | [godflight.com](https://godflight.com/) · [앱 안내](https://godflight.com/app) · [App Store](https://apps.apple.com/kr/app/id6502391255) · [Google Play](https://play.google.com/store/apps/details?id=com.godflight.official) |
| 알리항공권 | **AliExpress Travel**(알리익스프레스 트래블)의 항공권. 공급원은 Alibaba **Fliggy** | https://www.aliexpress.com (Travel 전용 URL은 미확인) | Travel Platform | 있음 | 미확인 | 부분(AliExpress Travel 자체는 미확인, 공급원 Fliggy는 FlyAI 공식 플랫폼 있음) | 미확인 | 있음 | **FlyAI CLI 옵트인**으로 가능(CNY 가격, 환율 필요, 약관 확인 필요) | **MANUAL** → 옵트인 시 LIVE | [Newsis](https://www.newsis.com/view/ALSX20250605_0000003125) · [Korea Herald](https://www.koreaherald.com/article/10503653) · [FlyAI](https://open.fly.ai/) · [flyai-skill](https://github.com/alibaba-flyai/flyai-skill) · [npm](https://www.npmjs.com/package/@fly-ai/flyai-cli) |
| Trip.com | 트립닷컴 글로벌 OTA | https://kr.trip.com/flights/ | OTA, Affiliate | 있음 | 없음 | **있음** (Flight 개발자 문서 공개) | **있음**(협약 후 키 발급) | 있음 | **B: Partner 승인 후 API 가능** | **PARTNER REQUIRED** | [Flight Docs](https://developers.trip.com/flight/?lang=en-US) · [Authentication](https://developers.trip.com/flight/guides/authentication/?lang=en-US) · [Quick Start](https://developers.trip.com/flight/guides/quickStart) · [Affiliate](https://www.trip.com/ask/questions/trip.com-affliate-program.html) |

같은 정보가 코드의 `src/config/source-profiles.ts`에 있고 `/admin/providers`와 테스트(`tests/profiles.test.ts`)가 이를 사용한다.

### B. 실제 데이터(LIVE) 연결 상태

| Provider | 지금 LIVE 가능? | 조건 |
|---|---|---|
| Skyscanner | **키만 넣으면 가능** (코드 완성) | `SKYSCANNER_API_KEY` — 승인 필요 |
| 알리항공권 | 옵트인하면 가능 (미검증) | `npm i -g @fly-ai/flyai-cli`, `ALI_PROVIDER_MODE=flyai`, `FX_CNY_KRW` |
| Trip.com | 불가 | 파트너 협약 + Shopping 스키마 확인 필요 |
| 캐치프로그 / 플레이윙즈 / 출국의 신 | 불가 | 공식 Feed·제휴 또는 약관·robots 확인 후 허용 시 |

현재 **키/승인이 있는 서비스가 없어 LIVE 데이터는 0개**다. 화면은 서비스마다 `LIVE` / `DEMO` / `MANUAL` / `API REQUIRED` / `PARTNER REQUIRED` / `ERROR` 배지를 붙여 실제 가격과 테스트 가격을 혼동할 수 없게 한다.

### C. Skyscanner 구현 내용

* `POST /apiservices/v3/flights/live/search/create` → `POST …/poll/{sessionToken}` 를 `RESULT_STATUS_COMPLETE`까지(최대 횟수 제한) 반복. `RESULT_ACTION_NOT_MODIFIED`면 기존 결과 유지, 상한 도달 시 부분 결과 반환. (`src/providers/skyscanner/client.ts`)
* 401/403 → `api_required`(키 거부), 429/5xx → 일반 오류. 오류 메시지에 키·응답 본문을 넣지 않는다.
* 매핑(`mapper.ts`): 항공사, 출·도착 공항(응답 `places`의 IATA), 출·도착 시각(공항 시간대 반영), 귀국편, 경유 수, 총 소요시간, 가격(milli-unit→원, 1인당/총액), 통화, **판매처(agent 이름, mashup은 " + ")**, 딥링크, 조회 시각. 한 itinerary에 pricing option이 여럿이면 최저가를 쓴다. 가격 없는 itinerary·시간대 불명 공항은 건너뛴다(만들어내지 않음).
* 테스트 fixture: `tests/fixtures/skyscanner-*.json` — **공식 문서 구조를 따라 손으로 쓴 것**이며 실제 캡처가 아니다. 실제 키로 첫 호출 시 필드 차이가 나올 수 있다.
* Indicative Prices(날짜 탐색)는 Phase 3.

### D. Trip.com 분류

**분류: B — Partner 승인 후 API 연결 가능** (보조: C — Affiliate 딥링크)

* "가격 조회 API가 공개되어 있지 않음"이 아니라 **API 문서는 공개되어 있고 자격증명이 협약 후 발급**되는 구조다. 문서에는 Shopping Offer, Booking, Payment, Order, Ticketing, Refund 등이 있고, 인증은 OAuth 2.0이며 "cooperation agreement 이후 product support 팀이 appKey/appSecret 발급"이라고 안내한다.
* 신청할 곳: https://developers.trip.com/flight/ 의 파트너 협력(product support) 문의. Affiliate는 별도 프로그램(https://www.trip.com/ask/questions/trip.com-affliate-program.html)으로 **추적 링크 수익화용**이며 가격 조회 API가 아니다. `connect.trip.com`은 호텔 중심 Connectivity 플랫폼으로 항공 가격 API와 다르다.
* 구현 보류 이유: Shopping Offer 요청/응답 필드는 이 환경에서 열람하지 못했다. 필드를 추측해 매퍼를 쓰지 않았고, 상태는 `partner_required`다. 자격증명 환경변수(`TRIP_APP_KEY`/`TRIP_APP_SECRET`)만 준비했다.
* 위 5단계 분류(A~E) 중 B, 근거는 위 표의 Docs/Authentication 링크.

### E. 알리항공권 — 이름 정리 (합치지 않음)

| 이름 | 정체 | 근거 |
|---|---|---|
| **AliExpress Travel (알리익스프레스 트래블)** | 2025-06 한국 정식 론칭한 AliExpress의 여행 플랫폼. 사용자가 말하는 **"알리항공권"은 이 서비스의 항공권** | [Newsis](https://www.newsis.com/view/ALSX20250605_0000003125), [한경](https://www.hankyung.com/article/202506057366g) |
| **Fliggy (飞猪)** | Alibaba 계열 OTA. AliExpress Travel에 **항공권·호텔 재고를 연동해 공급** — 별개 서비스 | [Korea Herald](https://www.koreaherald.com/article/10503653) |
| **FlyAI** | Fliggy의 개발자 플랫폼/CLI(`@fly-ai/flyai-cli`, MIT). AliExpress 앱이 아니다 | [open.fly.ai](https://open.fly.ai/) |
| AliTrip | Fliggy의 구 명칭으로 알고 있으나 **이번 조사에서 확인하지 못함(미확인)** | — |
| 한국 AliExpress 앱 내 여행 메뉴 | AliExpress Travel(여행전문관)과 동일한 것으로 보도됨 | [머니투데이](https://www.mt.co.kr/living/2025/06/05/2025060515285797231) |
| "알리 항공권(ARL)" | Trip.com의 공항 코드 ARL 페이지 — **이름만 비슷한 무관한 것** | [Trip.com](https://kr.trip.com/flights/to-arly/airfares-arl/) |

FlyAI 어댑터가 주는 값은 **Fliggy의 CNY 가격**이다. AliExpress Travel 한국의 KRW 판매가와 같다는 보장이 없어 옵트인으로만 켜지고 신뢰도(`confidence`)도 낮게 둔다. 출력 스키마(`adultPrice`, `journeys[].segments[]`, `jumpUrl`)는 공식 `search-flight.md` 문서 기준이며 왕복 응답 구조는 미검증이다(왕복은 `journeys[0]`=가는 편, `[1]`=오는 편으로 가정, 없으면 건너뜀).

### F. 서비스명 확정

"플라이윙즈"는 프로젝트 전체에서 **플레이윙즈 (Playwings)** 로 통일했다. 검색 결과상 실제 서비스명이 플레이윙즈(운영 ㈜타이드스퀘어, playwings.co.kr)다.

### G. robots.txt 확인 (사용자 작업)

`robots_status: UNVERIFIED` — 자동 수집을 영구 포기한 것이 아니라 **확인 전에는 실행하지 않는 것**이다. 로컬 브라우저에서 아래 URL과 각 서비스 이용약관을 확인해 주세요. 허용되는 경우에만 해당 Provider를 구현한다.

| 서비스 | robots.txt | 이용약관/정책 |
|---|---|---|
| 캐치프로그 | https://catchfrog.ai/robots.txt | catchfrog.ai 하단 약관 |
| Skyscanner | https://www.skyscanner.co.kr/robots.txt | API 사용은 공식 API 약관이 우선 |
| 플레이윙즈 | https://www.playwings.co.kr/robots.txt | https://www.playwings.co.kr/policies/terms.html |
| 출국의 신 | https://godflight.com/robots.txt | godflight.com 하단 약관 |
| 알리항공권 | https://www.aliexpress.com/robots.txt | AliExpress 이용약관 / FlyAI 약관(open.fly.ai) |
| Trip.com | https://kr.trip.com/robots.txt | Trip.com 이용약관 / Partner 계약 |

### H. 수집 방식 우선순위

1. 공식 API → 2. Partner API → 3. Affiliate/Feed → 4. Widget → 5. 공식 공개 JSON → 6. 공식 공개 Web 데이터 → 7. **허용 여부 확인 후** 브라우저 수집.
CAPTCHA·로그인·Cloudflare·anti-bot 우회, 세션 탈취, 앱 내부 API 역공학은 하지 않는다. `BrowserFlightProvider extends FlightProvider { mode: "browser" }` 인터페이스는 `src/providers/types.ts`에 **구조만** 있고 구현체·Playwright 실행은 없다.

### I. 필요한 사용자 작업

| 순서 | 할 일 | 어디서 |
|---|---|---|
| 1 | Skyscanner Flights Live Prices API 접근 신청 | https://partners.skyscanner.net (심사, 개인 승인은 보장되지 않음 — 예약 발생 목적 요구) |
| 2 | Trip.com Flight API 파트너 협력 문의 / (보조) Affiliate 가입 | https://developers.trip.com/flight/ , Trip.com Affiliate |
| 3 | 로컬 브라우저로 6개 robots.txt·약관 확인 후 결과 공유 | 위 G 표 |
| 4 | 플레이윙즈에 특가 Feed/제휴 문의 | contact@playwings.co.kr |
| 5 | 캐치프로그에 데이터/제휴 API 문의 | catchfrog@groonui.com |
| 6 | 출국의 신 운영사에 제휴 문의 | Instagram @godflight_official (공식 이메일은 미확인) |
| 7 | (선택) FlyAI 옵트인: 약관 확인 후 CLI 설치, `ALI_PROVIDER_MODE=flyai`, `FX_CNY_KRW` 설정 | https://open.fly.ai/ |
| 8 | (선택) 개발 환경 네트워크에서 공식 문서 도메인 허용 → Trip.com 매퍼/각 서비스 정밀 조사 | 환경 설정 > Network access |

### Provider 상태 값
`ok`(가격 확인) · `deals_only`(특가만 확인) · `no_results`(조회 성공, 결과 없음) · `manual_check`(자동 조회 불가, 직접 확인) · `api_required` · `partner_required` · `unavailable` · `timeout` · `error`

### DEMO_MODE
`DEMO_MODE=true`이면 키/승인이 없는 소스가 **DEMO DATA**(`DEMO` 배지)로 채워진다. 실제 키가 설정된 Skyscanner는 DEMO_MODE와 무관하게 실제 호출을 쓴다. 실제 데이터가 하나라도 있으면 데모는 비교에서 제외된다. 운영에서는 `false`.

## 폴더 구조

```
flightradar-kr/
  drizzle/                     # drizzle-kit이 생성한 SQL 마이그레이션 (Supabase에 적용)
  src/
    app/
      page.tsx                 # HOME + 검색창
      search/                  # 검색 결과 (page, loading, error)
      admin/providers/         # Provider Health
      api/search/route.ts      # 검색 API (서버 전용)
    components/                # UI 컴포넌트
    features/
      flight-search/           # engine, normalize, compare, cache, schema
      deal-engine/             # (Phase 4)
      alerts/                  # (Phase 2)
      price-history/           # (Phase 2)
    providers/
      types.ts                 # FlightProvider / DealProvider
      registry.ts
      skyscanner/ trip/ mock/ catchfrog/ playwings/ chulguk/ ali-flight/
    lib/                       # db(schema), logger, env, format
    config/                    # airports 등
    types/domain.ts            # 공통 도메인 모델
  tests/
```

## DB 구조

`src/lib/db/schema.ts` (Drizzle) → `drizzle/*.sql`. 테이블: `users`, `airports`, `providers`, `searches`, `watchlists`, `flight_offers`, `price_history`, `deals`, `alerts`, `alert_history`, `provider_logs`.
`price_history`는 `(watchlist_id, fetched_at)`, `(watchlist_id, provider, flight_key, fetched_at)` 인덱스를 가진다. Phase 1에서는 스키마만 설계하며 아직 DB에 연결하지 않는다(검색 캐시는 메모리).

## 환경변수

`.env.example` 참고. 실제 키는 `.env.local`에만 두며 Git에 올리지 않는다. 모든 키는 서버에서만 읽는다(`server-only`).

## 실행 방법

```bash
npm install
cp .env.example .env.local   # 키가 없어도 DEMO 데이터로 동작
npm run dev                  # http://localhost:3000
npm run typecheck && npm run lint && npm test
```

## Provider 추가 방법

1. `src/providers/<name>/index.ts`에 `FlightProvider`(또는 `DealProvider`) 구현.
2. 응답 → `FlightOffer` 변환은 `mapper.ts`, 원본 타입은 `types.ts`.
3. `src/providers/registry.ts`에 등록. 나머지 코드는 수정할 필요 없음.

## 앞으로 작성할 항목 (Phase 2+)

API 연결 방법 상세, Telegram 연결, Cron 동작 방식, Vercel 배포 방법.
