# FlightRadar KR · 항공권 특가 레이더

여러 항공권 서비스의 가격을 한 곳에서 비교하고, 원하는 날짜·노선의 가격을 추적해 좋은 가격이 나왔을 때 알려주는 개인용 항공권 가격 추적 프로그램.

> **핵심 원칙: 데이터 공급처 하나가 사라져도 프로그램 전체는 영향을 받지 않는다.**
> 모든 공급처는 `Provider Adapter` 뒤에 있고, 검색은 `Promise.allSettled` + 타임아웃으로 격리된다.

> 이 폴더는 GitHub 프로필 저장소(`chojoeeeee/chojoeeeee`) 안에 있으므로 루트의 프로필 `README.md`와 분리하기 위해 `flightradar-kr/` 하위에 만들었다. 별도 저장소로 옮길 때는 폴더째 이동하면 된다.

## 개발 현황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트/DB 스키마/검색 UI/Provider Adapter/가격 비교 + **6개 서비스 전부 조회** | 구현됨 |
| 1.5 | **실제 Provider 연동 조사·구현** (Skyscanner 완성, FlyAI 옵트인, 근거 기록) | 구현됨 |
| 1.5b | 캐치프로그·출국의 신 **공개 웹 Deal Provider** 재분류, Skyscanner **자동 호출 금지 정책**, Provider별 스케줄 정책, 결과 화면 2영역 분리 | **구현됨 (승인 대기)** |
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

### A. 6개 서비스 최종 조사표 (Phase 1.5b 재분류)

데이터의 **성격**으로 두 종류로 나눈다. **실제 일정 가격 비교**(날짜를 넣어 가격을 조회) / **관련 특가**(서비스가 공개한 특가 목록). 특가는 일정이 정확히 같지 않을 수 있어 항공권 가격 순위에 넣지 않는다.

| Provider | 결과 화면 영역 | 정확한 서비스 | 공식 URL | 서비스 유형 | Flight Search | Deal | 공식 API | Partner API | 공개 Web | 자동조회(백그라운드) | 현재 상태 | 근거 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Skyscanner | 실제 일정 | 스카이스캐너 항공권 메타서치 | https://www.skyscanner.co.kr | Metasearch | **YES** | NO | **YES** | YES(승인제) | NO(수집 대상 아님) | **사용자 검색 LIVE ✓ / 백그라운드 ✗ (정책 제한)** | API REQUIRED | [Usage Guidelines](https://developers.skyscanner.net/docs/getting-started/usage-guidelines) · [Overview](https://developers.skyscanner.net/docs/flights-live-prices/overview) · [Create/poll](https://developers.skyscanner.net/docs/getting-started/create-and-poll) · [Refresh](https://developers.skyscanner.net/docs/flights-live-prices/refresh-prices) |
| Trip.com | 실제 일정 | 트립닷컴 글로벌 OTA | https://kr.trip.com/flights/ | OTA, Affiliate | **YES** | NO | YES(문서 공개) | **Partner 필요(분류 B)** | 미확인 | 협약 조건 확인 필요 → 확인 전 백그라운드 ✗ | PARTNER REQUIRED | [Flight Docs](https://developers.trip.com/flight/?lang=en-US) · [Authentication](https://developers.trip.com/flight/guides/authentication/?lang=en-US) |
| 캐치프로그 | 관련 특가 | 캐치프로그(Catchfrog) 여행 리워드·예약 플랫폼, 운영사 ㈜그루누이 | https://catchfrog.ai | Deal Service, Travel Platform | 미확인 | **YES** ("뚝 떨어진 항공권") | 미확인 | 미확인 | **YES** (노선·현재 가격·평균 대비 할인율 공개) | 약관·robots 확인 전 사용자 ✗ / 백그라운드 ✗ | MANUAL → 승인 후 **PUBLIC DEAL** | [catchfrog.ai](https://catchfrog.ai/) · [App Store](https://apps.apple.com/kr/app/id6737223338) · [한경 기사](https://magazine.hankyung.com/job-joy/article/202511056546d) |
| 플레이윙즈 (Playwings) | 관련 특가 | 항공권·여행 특가 알림 서비스, 운영사 ㈜타이드스퀘어 | https://www.playwings.co.kr | Deal Service, Travel Platform | 미확인 | **YES** | 미확인 | 미확인 | **재조사 필요**(Feed/RSS/공개 JSON 미확인) | 확인 전 ✗ / ✗ | MANUAL | [공식 웹](https://www.playwings.co.kr/banners/) · [약관](https://www.playwings.co.kr/policies/terms.html) |
| 출국의 신 | 관련 특가 | 출국의 신(Godflight) — 출발 임박 땡처리·취소표 특가, 앱 개발사 Puzzle Company, Inc. | https://godflight.com | Deal Service | **NO**(날짜 검색이 아닌 임박 특가 목록) | **YES** | 미확인 | 미확인 | **YES** (출발지·도착지·가격·D-Day·출발/도착 날짜·요일·여행 기간 공개) | 약관·robots 확인 전 사용자 ✗ / 백그라운드 ✗ | MANUAL → 승인 후 **PUBLIC DEAL** | [godflight.com](https://godflight.com/) · [앱 안내](https://godflight.com/app) · [App Store](https://apps.apple.com/kr/app/id6502391255) |
| 알리항공권 | 실제 일정 | AliExpress Travel 항공권(공급원 Fliggy) | https://www.aliexpress.com | Travel Platform | 가능성 있음(FlyAI 실험) | 미확인 | 부분(FlyAI) | 미확인 | 미확인 | FlyAI 실험적: 사용자 ✓(옵트인) / 백그라운드 ✗ — 정확한 이용 조건 확인 필요 | MANUAL → 옵트인 시 LIVE(CNY) | [Newsis](https://www.newsis.com/view/ALSX20250605_0000003125) · [FlyAI](https://open.fly.ai/) · [flyai-skill](https://github.com/alibaba-flyai/flyai-skill) |

같은 정보가 코드의 `src/config/source-profiles.ts`에 있고 `/admin/providers`와 테스트가 이를 사용한다. "공개 Web = YES"는 **데이터가 공개 페이지에 노출된다**는 뜻이지 **자동 수집이 허용된다**는 뜻이 아니다 (약관·robots 확인 필요).

### B. 실제 데이터(LIVE) 연결 상태

| Provider | 지금 LIVE 가능? | 조건 |
|---|---|---|
| Skyscanner | **키만 넣으면 가능** (코드 완성) | `SKYSCANNER_API_KEY` — 승인 필요 |
| 알리항공권 | 옵트인하면 가능 (미검증) | `npm i -g @fly-ai/flyai-cli`, `ALI_PROVIDER_MODE=flyai`, `FX_CNY_KRW` |
| Trip.com | 불가 | 파트너 협약 + Shopping 스키마 확인 필요 |
| 캐치프로그 / 출국의 신 | 아직 불가(구조 준비 완료) | 약관·robots 허용 확인 → `*_COLLECTION_APPROVED=yes` → 페이지 구조 확인 후 추출기 구현 |
| 플레이윙즈 | 불가 | 공식 Feed/제휴 확인 또는 약관·robots 확인 후 |

현재 **키/승인이 있는 서비스가 없어 LIVE 데이터는 0개**다. 화면은 서비스마다 `LIVE` / `PUBLIC DEAL` / `DEMO` / `MANUAL` / `API REQUIRED` / `PARTNER REQUIRED` / `POLICY` / `ERROR` 배지를 붙여 실제 가격과 테스트 가격을 혼동할 수 없게 한다.

### C. Skyscanner 구현 내용

* `POST /apiservices/v3/flights/live/search/create` → `POST …/poll/{sessionToken}` 를 `RESULT_STATUS_COMPLETE`까지(최대 횟수 제한) 반복. `RESULT_ACTION_NOT_MODIFIED`면 기존 결과 유지, 상한 도달 시 부분 결과 반환. (`src/providers/skyscanner/client.ts`)
* 401/403 → `api_required`(키 거부), 429/5xx → 일반 오류. 오류 메시지에 키·응답 본문을 넣지 않는다.
* 매핑(`mapper.ts`): 항공사, 출·도착 공항(응답 `places`의 IATA), 출·도착 시각(공항 시간대 반영), 귀국편, 경유 수, 총 소요시간, 가격(milli-unit→원, 1인당/총액), 통화, **판매처(agent 이름, mashup은 " + ")**, 딥링크, 조회 시각. 한 itinerary에 pricing option이 여럿이면 최저가를 쓴다. 가격 없는 itinerary·시간대 불명 공항은 건너뛴다(만들어내지 않음).
* 테스트 fixture: `tests/fixtures/skyscanner-*.json` — **공식 문서 구조를 따라 손으로 쓴 것**이며 실제 캡처가 아니다. 실제 키로 첫 호출 시 필드 차이가 나올 수 있다.
* Indicative Prices(날짜 탐색)는 Phase 3. **Live 호출은 사용자 검색에서만** — 자동/백그라운드 호출 금지(아래 J).

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
| 3-1 | **캐치프로그·출국의 신**: 약관·robots 확인 → 허용이면 `CATCHFROG_COLLECTION_APPROVED=yes` / `GODFLIGHT_COLLECTION_APPROVED=yes` 설정, 그리고 **페이지 소스(view-source) 샘플과 Network 탭의 JSON 요청 유무를 공유** (추출기 구현에 필요) | 각 사이트 robots.txt·약관 |
| 3-2 | Skyscanner 파트너 계약/담당자에게 **"Watchlist용 자동 가격 확인이 허용되는지, Indicative/Refresh의 자동 호출 범위"** 확인 | Skyscanner Partners 담당자 |
| 4 | 플레이윙즈에 특가 Feed/제휴 문의 | contact@playwings.co.kr |
| 5 | 캐치프로그에 데이터/제휴 API 문의 | catchfrog@groonui.com |
| 6 | 출국의 신 운영사에 제휴 문의 | Instagram @godflight_official (공식 이메일은 미확인) |
| 7 | (선택) FlyAI 옵트인: 약관 확인 후 CLI 설치, `ALI_PROVIDER_MODE=flyai`, `FX_CNY_KRW` 설정 | https://open.fly.ai/ |
| 8 | (선택) 개발 환경 네트워크에서 공식 문서 도메인 허용 → Trip.com 매퍼/각 서비스 정밀 조사 | 환경 설정 > Network access |

### J. Skyscanner 사용 정책 반영 (자동 Live 호출 금지)

Skyscanner Usage Guidelines(2026-10-07 확인, 검색 스니펫 기준)는 Live Pricing 호출이 **사용자 요청에서만** 발생해야 하고(*"Live Pricing Service calls are only made on user-generated requests, and automated requests (calls without user action) … do not occur"*), **정확한 출발·도착과 날짜가 모두 정해졌을 때만** 호출하도록 요구한다. 따라서 "Watchlist를 6시간마다 Live API로 자동 조회"는 **구현하지 않는다.**

| Skyscanner 기능 | 용도 | 사용자 검색 | 백그라운드 | 정책 상태 |
|---|---|---|---|---|
| **Flights Live Prices** (create → poll) | 사용자가 검색 버튼을 눌렀을 때 실제 일정 가격 | ✓ | **✗** | **confirmed** (Usage Guidelines) |
| **Indicative Prices** | 정확한 날짜가 없는 날짜 탐색(Flexible/Explore) — **검토 단계, 미구현** | ✓(검토) | ✗ | unverified — 파트너 계약 확인 전까지 자동 호출 금지 |
| **Itinerary Refresh** (`/itineraryrefresh/create`, `/poll`) | 사용자가 **선택한 항공편**의 최신가(세션 토큰+itinerary id 필요, 캐시 약 10분) | ✓(미구현) | ✗ | unverified — 정확도 용도이며 모니터링 API로 해석하지 않음. 파트너 정책 확인 전 백그라운드 금지 |

구현: 정책 상수는 `src/providers/skyscanner/policy.ts`(기능별 분리). `SkyscannerProvider`는 `trigger: "background"` 호출을 **네트워크 호출 없이 거부**하고, 엔진도 정책으로 한 번 더 막는다(이중 장치). 파트너 계약에서 자동 가격 추적이 명시적으로 허용되면 해당 상수만 바꾸면 된다.

### K. Provider별 자동 조회(스케줄) 정책

`ProviderSchedulePolicy { userInitiatedSearch, backgroundPolling, minimumInterval?, policyStatus, notes? }` — **Provider마다 독립 관리**(각 Provider 파일), 선언이 없으면 **보수적 기본값(사용자 검색만, 백그라운드 금지)**.

| Provider | 사용자 검색 | 백그라운드 | 최소 간격 | 근거 상태 | 비고 |
|---|---|---|---|---|---|
| Skyscanner Live | ✓ | **✗** | — | confirmed | Usage Guidelines |
| Skyscanner Indicative / Refresh | ✓ | ✗ | — | unverified | 계약 확인 전 금지 |
| Trip.com | ✓(협약 후) | ✗ | — | unverified | 협약 조건 확인 필요 |
| 캐치프로그 | 승인 전 ✗ | 승인 전 ✗ | 60분(캐시) | unverified | `CATCHFROG_COLLECTION_APPROVED`, 백그라운드는 `CATCHFROG_BACKGROUND_APPROVED` 별도 |
| 출국의 신 | 승인 전 ✗ | 승인 전 ✗ | 60분(캐시) | unverified | `GODFLIGHT_COLLECTION_APPROVED`, `GODFLIGHT_BACKGROUND_APPROVED` |
| 플레이윙즈 | ✗ | ✗ | — | unverified | 자동 수집 방식 미확인 |
| 알리항공권(FlyAI) | ✓(옵트인) | ✗ | — | unverified | 실험적 경로 |

엔진은 `trigger: "user" | "background"`를 받는다(기본 `user`). `background`일 때 정책이 금지한 Provider는 **호출하지 않고** `policy_skipped`로 표시한다. flight/deal 부분도 따로 판단한다.

### L. 캐치프로그·출국의 신 — 공개 웹 구조 점검표 (7개 항목)

두 사이트 모두 개발 환경에서 직접 열람이 막혀(EGRESS_BLOCKED) **HTML 구조는 확인하지 못했다.** 사용자가 알려준 공개 필드는 파서 입력 타입으로 반영했다. 상태: `CONFIRMED` / `INFERRED`(추정) / `UNVERIFIED`.

| 점검 항목 | 캐치프로그 | 출국의 신 |
|---|---|---|
| ① 서버 렌더링 HTML 여부 | INFERRED — 검색 결과에 노선·가격·할인율 텍스트 노출(세부 257,900원 -45.0%, 후쿠오카 165,300원 -44.7%) | UNVERIFIED |
| ② 브라우저 렌더링 후 생성 | UNVERIFIED | UNVERIFIED |
| ③ 별도 JSON endpoint | UNVERIFIED (앱 내부 API 역공학은 하지 않음) | UNVERIFIED |
| ④ pagination / filter URL | UNVERIFIED | UNVERIFIED (앱은 ICN/GMP/PUS/TAE 필터, 달력 보기) |
| ⑤ robots.txt | UNVERIFIED | UNVERIFIED |
| ⑥ 약관의 자동 수집 허용 | UNVERIFIED | UNVERIFIED |
| ⑦ 갱신 주기 | UNVERIFIED (앱은 "실시간 가격 변동 분석") | INFERRED — 새 특가가 올라오면 알림 → 수시 갱신 추정 |

**구현 상태**: `CatchfrogDealProvider`, `GodFlightDealProvider`, 원본→`TravelDeal` 매퍼(`mapper.ts`), robots.txt 파서(`providers/robots.ts`), 정중한 수집기(`providers/public-web.ts`: robots 선확인·UA 명시·캐시·크기 제한)가 있다. **수집은 기본 OFF**이며 사용자가 약관·robots를 확인하고 `*_COLLECTION_APPROVED=yes`를 지정해야 한다. 승인 후에도 **HTML 추출기는 구조 미확인이라 구현하지 않았다** (`StructureUnverifiedError` → 화면에는 `MANUAL`). 페이지 소스(view-source) 샘플을 주면 추출기를 완성한다.

* 캐치프로그 매퍼: 출발지·목적지·현재 가격·평균 대비 할인율 → `TravelDeal`(날짜 없음 → "같은 노선의 특가"). 평균가가 없고 할인율만 있으면 `가격/(1−할인율)`로 계산(페이지가 둘 다 주면 페이지 값을 그대로 사용).
* 출국의 신 매퍼: 출발지·도착지·가격·D-Day·출발 날짜·도착 날짜·요일·여행 기간 → `TravelDeal`. 연도 없는 날짜는 오늘 기준 다음 도래일로 추정하고, **요일이 날짜와 안 맞거나 종료일이 시작일보다 앞서면 그 행을 버린다**(고쳐 쓰지 않음). "도착 날짜"는 여행 종료일(귀국)로 간주했다 — 가정이며 실제 열 의미 확인 필요.
* 출국의 신은 `FlightSearchProvider`가 아니라 `DealProvider`로만 등록된다.

### M. 결과 화면 구성

1. **실제 일정 가격 비교** — 날짜 검색이 되는 Provider(Skyscanner, Trip.com, 알리항공권 등)만 순위·가격차 표시.
2. **🔥 관련 특가** — 캐치프로그·플레이윙즈·출국의 신(·Ali 특가). 가격 순위에 넣지 않는다. 선택한 노선과 일정에 맞는 것만 보여준다.
   * 매칭 조건: **출발지 일치(같은 도시권 포함) · 목적지 일치 · 날짜 범위 유사(±3일) · 여행 기간 유사(±1일)**. 일정이 정확히 같거나 기간형 특가(선택 일정을 포함)면 그대로, 하루 차이 같은 경우는 "비슷한 일정 특가"로 표시.
   * 예: ICN→도쿄 11/12~11/15 검색, 출국의 신 ICN→도쿄 11/11~11/14 139,000원, 최저 항공권 178,000원 → "일정을 하루 앞당기면 1인당 약 39,000원 절약" (테스트로 검증).
3. 6개 서비스는 두 영역 중 하나에 **항상** 표시(자동 조회 불가·정책으로 건너뜀·오류 포함).

### N. Phase 2에서 구현 가능한 자동 알림 방식 (Phase 2는 아직 시작 안 함)

Watchlist Engine과 Provider Search Engine을 분리한다. Watchlist 쪽은 Provider를 직접 부르지 않고 `planBackgroundRefresh()`(`src/features/alerts/background-plan.ts`)로 "이번 실행에서 호출해도 되는 Provider"를 정책에서 받아 `runSearch({trigger:"background"})`에 넘긴다. 엔진이 같은 규칙을 한 번 더 강제한다.

| 알림 종류 | 대상 | 동작 |
|---|---|---|
| **A. Background Alert** | 정책이 백그라운드를 허용한 데이터 (현재: 없음. 승인·계약 후 캐치프로그/출국의 신 공개 특가 등) | 스케줄러가 최소 간격을 지켜 조회 → 새 최저가/목표가 도달 시 Telegram |
| **B. User Refresh Alert / Status** | 사용자 검색에서만 조회 가능한 Live 데이터 (Skyscanner Live, Trip.com 등) | 자동 조회 없음. Watchlist 카드에 "마지막 확인 가격/시각"을 보여 주고, 사용자가 앱을 열거나 검색할 때 재조회 → 그때 가격이 내려갔으면 알림/배지 |

정리: 현재 기본 설정에서는 **백그라운드로 호출 가능한 Provider가 0개**이므로, Phase 2 초기에는 B 방식(사용자 새로고침 시 알림)이 중심이고 A는 약관·계약 확인이 끝난 Provider부터 하나씩 켠다. Provider 공식 가격 알림 API가 확인되면 별도 연결한다.

### Provider 상태 값
`ok`(가격 확인) · `deals_only`(특가만 확인) · `no_results`(조회 성공, 결과 없음) · `manual_check`(자동 조회 불가, 직접 확인) · `api_required` · `partner_required` · `unavailable` · `timeout` · `error` · `policy_skipped`(백그라운드 호출이 정책상 허용되지 않아 건너뜀)

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
