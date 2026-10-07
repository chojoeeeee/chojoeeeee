# FlightRadar KR · 항공권 특가 레이더

여러 항공권 서비스의 가격을 한 곳에서 비교하고, 원하는 날짜·노선의 가격을 추적해 좋은 가격이 나왔을 때 알려주는 개인용 항공권 가격 추적 프로그램.

> **핵심 원칙: 데이터 공급처 하나가 사라져도 프로그램 전체는 영향을 받지 않는다.**
> 모든 공급처는 `Provider Adapter` 뒤에 있고, 검색은 `Promise.allSettled` + 타임아웃으로 격리된다.

> 이 폴더는 GitHub 프로필 저장소(`chojoeeeee/chojoeeeee`) 안에 있으므로 루트의 프로필 `README.md`와 분리하기 위해 `flightradar-kr/` 하위에 만들었다. 별도 저장소로 옮길 때는 폴더째 이동하면 된다.

## 개발 현황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트/DB 스키마/검색 UI/Provider Adapter/Mock/Skyscanner/가격 비교/검색 결과 | **구현됨 (승인 대기)** |
| 2 | Watchlist, 가격 저장, 가격 그래프, Cron, Telegram, 목표가 알림 | 미착수 |
| 3 | Trip.com 연결, 추가 Provider, 특가 Feed, 최저가 캘린더, ±날짜 검색 | 미착수 |
| 4 | Deal Score, 가격 분석, 여행지 미정 검색, 추천 고도화, Web Push | 미착수 |

각 Phase는 사용자 승인 후에만 다음으로 넘어간다.

## 아키텍처

네 개의 엔진을 강하게 분리한다.

| 엔진 | 역할 | 위치 | Phase |
|---|---|---|---|
| Search Engine | 노선/날짜에 맞는 가격 조회, 캐시, 장애 격리 | `src/features/flight-search/engine.ts` | 1 |
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

## 데이터 연결 방식 조사 (STEP 3)

> ⚠️ 아래 표는 **확인된 사실**과 **미확인 항목**을 구분한다. 개발 환경에서 외부 문서/약관을 직접 열람·검증하지 못한 항목은 "확인 필요"로 표시했고, 확인 전에는 실제 연동을 구현하지 않는다. 서비스명은 코드/문서에서 사용자가 말한 "플라이윙즈" 대신 **Playwings**로 가정했다 — 실제 서비스명 확인 필요.

| Provider | 공식 API | 제휴 API | 공개 데이터 | 인증 | 현재 구현 가능 | 추천 연결 방식 | 주의사항 |
|---|---|---|---|---|---|---|---|
| Skyscanner | Skyscanner Partners API (Flights Live Prices / Indicative Prices) 존재로 알려짐 | 파트너 승인 필요 (Travel APIs) | 확인 필요 | API Key (`x-api-key`) | 어댑터 + Mock 완료. 실호출 코드는 **문서 기준 구현, 실제 키로 미검증** | 파트너 승인 후 `SKYSCANNER_API_KEY` 설정 → Indicative로 날짜 탐색, Live로 후보 날짜 확인 | 승인 전에는 `api_required`로 표시. 개인 프로젝트에 키가 발급되는지 확인 필요 |
| Trip.com | 확인 필요 (Trip.com 파트너/Affiliate 프로그램 조사 필요) | Affiliate/Partner 승인 필요로 추정 — **확인 필요** | 확인 필요 | 확인 필요 | Adapter + Mock (`TRIP_PROVIDER_MODE=mock`) | 승인 후 `providers/trip/index.ts`만 교체 | 승인 전에는 `partner_required` |
| Catchfrog (캐치프로그) | 확인되지 않음 | 확인되지 않음 | 특가 게시글 성격 — 약관/robots 확인 필요 | 확인 필요 | Adapter 골격 (`unavailable`/`api_required`) | 공식 Feed/제휴 확인 시 DealProvider로 연결 | 스크래핑은 약관·robots 확인 전까지 하지 않음 |
| Playwings | 확인되지 않음 | 확인되지 않음 | 특가 게시글 성격 — 약관/robots 확인 필요 | 확인 필요 | Adapter 골격 | 동일 | 실제 서비스명 확인 필요 |
| 출국의 신 | 확인되지 않음 | 확인되지 않음 | 특가 게시글 성격 — 약관/robots 확인 필요 | 확인 필요 | Adapter 골격 | 동일 | 동일 |
| 알리항공권 | 확인되지 않음 (AliExpress/Alibaba 계열 제휴 프로그램 여부 확인 필요) | 확인 필요 | 확인 필요 | 확인 필요 | Adapter 골격 | 제휴 프로그램 확인 후 결정 | 동일 |

Provider별 실제 상태는 `/admin/providers`에서 확인한다 (`healthCheck()` 결과).

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
