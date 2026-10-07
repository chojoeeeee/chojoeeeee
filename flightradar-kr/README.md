# FlightRadar KR · 항공권 특가 레이더

여러 항공권 서비스의 가격을 한 곳에서 비교하고, 원하는 날짜·노선의 가격을 추적해 좋은 가격이 나왔을 때 알려주는 개인용 항공권 가격 추적 프로그램.

> **핵심 원칙: 데이터 공급처 하나가 사라져도 프로그램 전체는 영향을 받지 않는다.**
> 모든 공급처는 `Provider Adapter` 뒤에 있고, 검색은 `Promise.allSettled` + 타임아웃으로 격리된다.

> 이 폴더는 GitHub 프로필 저장소(`chojoeeeee/chojoeeeee`) 안에 있으므로 루트의 프로필 `README.md`와 분리하기 위해 `flightradar-kr/` 하위에 만들었다. 별도 저장소로 옮길 때는 폴더째 이동하면 된다.

## 개발 현황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트/DB 스키마/검색 UI/Provider Adapter/가격 비교 + **6개 서비스 전부 조회** | **구현됨 (승인 대기)** |
| 2 | Watchlist, 가격 저장, 가격 그래프, Cron/스케줄러, Telegram 알림, 목표가·최저가 갱신 알림 | 미착수 (승인 필요) |
| 3 | 날짜 ±N일 비교, 최저가 캘린더, 실제 Provider 연동(승인 후), 특가 Feed 연동 | 미착수 |
| 4 | Deal Score, 가격 분석, 여행지 미정 검색, Web Push | 미착수 |

### MVP 완료 조건 (12개) 진행 현황

| # | 조건 | 상태 |
|---|---|---|
| 1 | 6개 Provider 모두 등록 | ✅ `src/providers/sources.ts` (테스트로 고정) |
| 2 | 검색 시 6개 모두 조회 시도 | ✅ 소스별 `/api/search/source` 병렬 호출 + `Promise.allSettled` |
| 3 | 각 Provider 상태 화면 표시 | ✅ 진행상태 + 결과 6행(성공/특가/결과없음/직접확인/오류…) |
| 4 | 연결 가능한 Provider는 실제 데이터 | ⏳ 코드 경로는 Skyscanner(키 필요, 미검증)만. 현재 **연결 가능한 실제 소스가 없음** — 키/승인 대기 |
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

## 데이터 연결 방식 조사

> **조사 한계(중요)**: 이 개발 환경은 외부 네트워크가 제한되어 있어 각 서비스의 robots.txt·약관·개발자 문서를 직접 열람하지 못했다 (catchfrog DNS 실패, playwings/skyscanner.co.kr 프록시 차단). 웹 검색으로 확인한 사실만 "확인됨"으로 적고, 나머지는 **확인 필요**로 둔다. **확인되지 않은 항목은 추측으로 구현하지 않는다.** 서비스명 "플라이윙즈"는 Playwings로 가정했다 (확인 필요).

| Provider | 공식 API | 제휴(Partner/Affiliate) API | 공개 웹 검색 | 로그인 필요 | 동적 렌더링 | 데이터 종류 | Flight Search | Deal Feed | 자동 조회 가능 | 주의사항 | 추천 구현방식 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Skyscanner** | **있음(확인됨)**: Travel APIs (Flights Live Prices / Indicative Prices), `x-api-key` | 승인제(확인됨): 정식 Travel API는 수동 심사, 규모 있는 파트너 위주. 경량 Affiliate Link API 별도 | 웹은 존재하나 봇 정책 확인 필요(robots 미열람) | API는 키 필요 | 웹은 동적(추정) | 항공권 가격(Live/Indicative) | ✅ | ❌ | **키 승인 후 가능**. 현재 `api_required` | 승인 전 실호출 불가. 어댑터 코드는 문서 기준이며 미검증 | 공식 API (Indicative로 날짜 탐색 → Live로 확인) |
| **Trip.com** | 일반 공개 Flight 검색 API는 확인 못 함 | **있음(확인됨)**: Affiliate 프로그램(Awin/Travelpayouts/Involve 등 경유), B2B 파트너 API 연동은 별도 협의 | 확인 필요 | 확인 필요 | 확인 필요(동적 추정) | 항공권 가격 | ✅(승인 시) | ❌ | **제휴 승인 후**. 현재 `partner_required` | Affiliate 링크만 제공되고 가격 조회 API가 아닐 수 있음 → 승인 후 범위 확인 | Affiliate/Partner API. 승인 전 Mock |
| **캐치프로그** | 확인되지 않음 | 확인되지 않음 | 확인 필요. **App Store 앱 확인됨**(여행 예약·포인트 적립, "뚝 떨어진 항공권" 특가 제공) — 웹 검색 페이지는 미확인 | 확인 필요 | 확인 필요 | 특가/프로모션 성격(추정) | 미확인 | 가능성 높음(추정) | **미확인 → `manual_check`** | 약관/robots 확인 전 스크래핑 금지 | 공식 Feed/제휴 문의 → 확인되면 DealProvider. 그 전엔 직접 확인 링크 |
| **Playwings** | 확인되지 않음 | 확인되지 않음 | 확인 필요. **App Store 앱 확인됨**(24시간 한정 특가 "윙즈오더", 여행 특가 알림) | 확인 필요 | 확인 필요 | 특가/프로모션 성격(추정) | 미확인 | 가능성 높음(추정) | **미확인 → `manual_check`** | 서비스명(플라이윙즈) 확인 필요 | 동일 |
| **출국의 신** | 확인되지 않음 | 확인되지 않음 | **App Store 앱 확인됨**(취소표·땡처리 항공권, 개발사 Puzzle Company) — 공개 웹 페이지 미확인 | 확인 필요 | 확인 필요 | 특가 정보(추정) | 미확인 | 가능성 높음(추정) | **미확인 → `manual_check`** | 동일 | 동일 |
| **알리항공권** | 확인되지 않음. **AliExpress Travel(Fliggy 연동, 한국어 고객센터) 론칭 확인됨**. AliExpress 계열 API는 상품·물류·Affiliate 링크 중심이며 항공권 API는 검색에서 확인 못 함 | 확인되지 않음 | 확인 필요 | 확인 필요 | 확인 필요 | 항공권(추정) | 미확인 | 미확인 | **미확인 → `manual_check`** | 실제 서비스 형태(자체 판매/타사 중개) 확인 필요 | 제휴 프로그램 존재 여부 확인 후 결정 |

"가능성 높음(추정)"은 서비스 성격에 대한 추정이며 구현 근거가 아니다. 상태가 바뀌면(승인/Feed 확인) 해당 `providers/<name>/index.ts`만 교체한다.

### Provider 상태 값
`ok`(가격 확인) · `deals_only`(특가만 확인) · `no_results`(조회 성공, 결과 없음) · `manual_check`(자동 조회 불가, 직접 확인) · `api_required` · `partner_required` · `unavailable` · `timeout` · `error`

### DEMO_MODE
`DEMO_MODE=true`이면 키/승인이 없는 소스가 **DEMO DATA**로 채워진다(화면에 항상 배지). Skyscanner/Trip.com/캐치프로그/알리항공권은 데모 항공권, Playwings는 데모 특가, 출국의 신은 `manual_check` 상태를 그대로 보여 모든 UI 상태를 확인할 수 있다. 실제 데이터가 하나라도 있으면 데모는 비교에서 제외된다. 운영에서는 `false`.

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
