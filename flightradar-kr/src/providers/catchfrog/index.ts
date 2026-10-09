import "server-only";
import { env } from "@/lib/env";
import { demoEnabled } from "../demo-mode";
import { generateDemoDeals } from "../mock/generator";
import { fetchPublicHtml } from "../public-web";
import { ProviderUnavailableError, StructureUnverifiedError, type DealProvider, type ProviderSchedulePolicy, type SearchContext, type SourceProvider } from "../types";
import type { DealQuery, ProviderHealth, TravelDeal } from "@/types/domain";
import { catchfrogToTravelDeal, parseCatchfrogRaw } from "./mapper";
import type { CatchfrogRawDeal } from "./types";

const NAME = "catchfrog";
export const CATCHFROG_URL = "https://catchfrog.ai/";
const BLOCKED =
  "공식 웹(catchfrog.ai)에 특가 목록이 공개돼 있지만 이용약관·robots.txt 확인 전이라 자동 수집을 하지 않습니다. (확인 후 CATCHFROG_COLLECTION_APPROVED=yes)";

/**
 * Collection is OFF until the owner has read catchfrog.ai's terms and robots.txt
 * and records that with CATCHFROG_COLLECTION_APPROVED=yes. Background polling needs
 * a second, separate approval (CATCHFROG_BACKGROUND_APPROVED=yes).
 */
export function catchfrogPolicy(): ProviderSchedulePolicy {
  const approved = env("CATCHFROG_COLLECTION_APPROVED") === "yes";
  return {
    userInitiatedSearch: approved,
    backgroundPolling: approved && env("CATCHFROG_BACKGROUND_APPROVED") === "yes",
    minimumInterval: 3_600_000,
    policyStatus: "unverified",
    notes: "약관·robots.txt 확인 전 자동 수집 금지. 공개 페이지는 캐시해 최소 60분 간격.",
  };
}

/** Turns the page HTML into raw records. Structure is UNVERIFIED, so the default refuses to guess. */
export type CatchfrogExtractor = (html: string) => CatchfrogRawDeal[];
export const unverifiedCatchfrogExtractor: CatchfrogExtractor = () => {
  throw new StructureUnverifiedError("catchfrog.ai의 HTML/데이터 구조(SSR 여부, JSON endpoint)가 아직 확인되지 않아 추출기를 구현하지 않았습니다. 페이지 소스 샘플이 필요합니다.");
};

export class CatchfrogDealProvider implements DealProvider {
  readonly name = NAME;
  readonly displayName = "캐치프로그";

  constructor(
    private readonly extract: CatchfrogExtractor = unverifiedCatchfrogExtractor,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  schedulePolicy = catchfrogPolicy;

  async getDeals(query: DealQuery, ctx?: SearchContext): Promise<TravelDeal[]> {
    const policy = catchfrogPolicy();
    if (ctx?.trigger === "background" && !policy.backgroundPolling) {
      throw new ProviderUnavailableError(NAME, "manual_check", "캐치프로그는 백그라운드 자동 수집이 허용되지 않았습니다.");
    }
    if (!policy.userInitiatedSearch) {
      if (demoEnabled()) return generateDemoDeals(query, NAME, "catchfrog");
      throw new ProviderUnavailableError(NAME, "manual_check", BLOCKED);
    }
    const html = await fetchPublicHtml({ provider: NAME, url: CATCHFROG_URL, signal: ctx?.signal, fetchImpl: this.fetchImpl, cacheTtlMs: policy.minimumInterval ?? 3_600_000 });
    const discoveredAt = new Date().toISOString();
    return parseCatchfrogRaw(this.extract(html), discoveredAt, CATCHFROG_URL).map(catchfrogToTravelDeal);
  }

  async healthCheck(): Promise<ProviderHealth> {
    const p = catchfrogPolicy();
    return { provider: NAME, status: p.userInitiatedSearch ? "connected" : demoEnabled() ? "demo" : "manual_check", message: p.userInitiatedSearch ? "공개 웹 수집 승인됨 (추출기 구조 미확인)" : BLOCKED, checkedAt: new Date().toISOString() };
  }
}

const deal = new CatchfrogDealProvider();

export const catchfrog: SourceProvider = {
  name: NAME,
  displayName: "캐치프로그",
  role: "deal",
  checkUrl: "https://catchfrog.ai",
  checkLabel: "캐치프로그에서 직접 확인",
  directUrl: () => "https://catchfrog.ai",
  deal,
};
