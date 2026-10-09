import "server-only";
import { env } from "@/lib/env";
import type { FlightOffer, FlightSearchQuery, ProviderHealth } from "@/types/domain";
import { demoEnabled } from "../demo-mode";
import { ProviderUnavailableError, type FlightProvider, type SearchContext } from "../types";
import { generateDemoOffers } from "../mock/generator";
import { searchLive } from "./client";
import { SKYSCANNER_LIVE_POLICY } from "./policy";
import { mapSkyscannerResponse } from "./mapper";
import type { IndicativeDayPrice } from "./types";

/**
 * Skyscanner provider.
 *  - With SKYSCANNER_API_KEY: Live Prices (unverified against a real key, see types.ts).
 *  - Without: deterministic DEMO offers flagged `isDemo`, status `api_required`.
 *
 * Planned two-step flow (Phase 3): `searchIndicative` finds cheap dates,
 * then `searchFlights` (Live) confirms the candidates.
 */
export class SkyscannerProvider implements FlightProvider {
  readonly name = "skyscanner";
  readonly displayName = "Skyscanner";

  isEnabled(): boolean {
    return true;
  }

  private apiKey(): string | undefined {
    return env("SKYSCANNER_API_KEY");
  }

  schedulePolicy() {
    return SKYSCANNER_LIVE_POLICY;
  }

  isDemo(): boolean {
    return !this.apiKey() && demoEnabled();
  }

  async searchFlights(query: FlightSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]> {
    // Defence in depth: the engine already skips background calls, but a Live Prices
    // request must never be made without a user action, whoever calls us.
    if (ctx?.trigger === "background") {
      throw new ProviderUnavailableError(this.name, "unavailable", "Skyscanner Live Prices는 사용자 검색에서만 호출할 수 있습니다 (자동/백그라운드 호출 금지).");
    }
    const apiKey = this.apiKey();
    if (!apiKey) {
      if (demoEnabled()) return generateDemoOffers(query, { provider: this.name, bias: 1.03 });
      throw new ProviderUnavailableError(this.name, "api_required", "SKYSCANNER_API_KEY가 필요합니다 (파트너 승인 필요)");
    }

    const res = await searchLive(
      { apiKey, market: env("SKYSCANNER_MARKET") ?? "KR", locale: env("SKYSCANNER_LOCALE") ?? "ko-KR" },
      query,
      ctx?.signal,
    );
    return mapSkyscannerResponse(res, query, new Date().toISOString());
  }

  /** Indicative Prices (date discovery). Not implemented until Phase 3 and a verified key. */
  async searchIndicative(): Promise<IndicativeDayPrice[]> {
    throw new Error("Skyscanner indicative search is not implemented yet (Phase 3)");
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.apiKey()) {
      return { provider: this.name, status: "api_required", message: demoEnabled() ? "SKYSCANNER_API_KEY 없음 — DEMO DATA 사용 중" : "SKYSCANNER_API_KEY 없음 (파트너 승인 필요)", checkedAt };
    }
    // A real ping would consume quota; report configured state only.
    return { provider: this.name, status: "connected", message: "API Key 설정됨 (실호출 미검증)", checkedAt };
  }
}
