import "server-only";
import { env } from "@/lib/env";
import { demoEnabled } from "../demo-mode";
import { generateDemoDeals } from "../mock/generator";
import { fetchPublicHtml } from "../public-web";
import { ProviderUnavailableError, StructureUnverifiedError, type DealProvider, type ProviderSchedulePolicy, type SearchContext, type SourceProvider } from "../types";
import type { DealQuery, ProviderHealth, TravelDeal } from "@/types/domain";
import { godflightToTravelDeals } from "./mapper";
import type { GodFlightRawDeal } from "./types";

const NAME = "chulguk";
export const GODFLIGHT_URL = "https://godflight.com/";
const BLOCKED =
  "공식 웹(godflight.com)에 출발 임박 특가 목록이 공개돼 있지만 이용약관·robots.txt 확인 전이라 자동 수집을 하지 않습니다. (확인 후 GODFLIGHT_COLLECTION_APPROVED=yes)";

/** Same two-step approval as Catchfrog; kept independent per provider. */
export function godflightPolicy(): ProviderSchedulePolicy {
  const approved = env("GODFLIGHT_COLLECTION_APPROVED") === "yes";
  return {
    userInitiatedSearch: approved,
    backgroundPolling: approved && env("GODFLIGHT_BACKGROUND_APPROVED") === "yes",
    minimumInterval: 60,
    policyStatus: "unverified",
    notes: "약관·robots.txt 확인 전 자동 수집 금지. 출발 7일 이내 목록이라 갱신이 잦을 수 있으나 최소 60분 간격으로 제한.",
  };
}

export type GodFlightExtractor = (html: string) => GodFlightRawDeal[];
export const unverifiedGodFlightExtractor: GodFlightExtractor = () => {
  throw new StructureUnverifiedError("godflight.com의 HTML/데이터 구조(SSR 여부, JSON endpoint)가 아직 확인되지 않아 추출기를 구현하지 않았습니다. 페이지 소스 샘플이 필요합니다.");
};

/** Deal provider only — godflight.com is a departing-soon deal list, not a date search. */
export class GodFlightDealProvider implements DealProvider {
  readonly name = NAME;
  readonly displayName = "출국의 신";

  constructor(
    private readonly extract: GodFlightExtractor = unverifiedGodFlightExtractor,
    private readonly fetchImpl?: typeof fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return true;
  }

  schedulePolicy = godflightPolicy;

  async getDeals(query: DealQuery, ctx?: SearchContext): Promise<TravelDeal[]> {
    const policy = godflightPolicy();
    if (ctx?.trigger === "background" && !policy.backgroundPolling) {
      throw new ProviderUnavailableError(NAME, "manual_check", "출국의 신은 백그라운드 자동 수집이 허용되지 않았습니다.");
    }
    if (!policy.userInitiatedSearch) {
      if (demoEnabled()) return generateDemoDeals(query, NAME, "godflight");
      throw new ProviderUnavailableError(NAME, "manual_check", BLOCKED);
    }
    const html = await fetchPublicHtml({ provider: NAME, url: GODFLIGHT_URL, signal: ctx?.signal, fetchImpl: this.fetchImpl, cacheTtlMs: (policy.minimumInterval ?? 60) * 60_000 });
    const now = this.now();
    // Kept as-is: matching against the user's route/dates happens in the deal engine, not here.
    return godflightToTravelDeals(this.extract(html), now.toISOString(), GODFLIGHT_URL, now.toISOString().slice(0, 10));
  }

  async healthCheck(): Promise<ProviderHealth> {
    const p = godflightPolicy();
    return { provider: NAME, status: p.userInitiatedSearch ? "connected" : demoEnabled() ? "demo" : "manual_check", message: p.userInitiatedSearch ? "공개 웹 수집 승인됨 (추출기 구조 미확인)" : BLOCKED, checkedAt: new Date().toISOString() };
  }
}

export const chulguk: SourceProvider = {
  name: NAME,
  displayName: "출국의 신",
  role: "deal",
  checkUrl: "https://godflight.com",
  checkLabel: "출국의 신에서 직접 확인",
  directUrl: () => "https://godflight.com",
  deal: new GodFlightDealProvider(),
};
