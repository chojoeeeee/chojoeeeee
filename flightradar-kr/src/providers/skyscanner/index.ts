import "server-only";
import { env } from "@/lib/env";
import type { FlightOffer, FlightSearchQuery, ProviderHealth } from "@/types/domain";
import type { FlightProvider, SearchContext } from "../types";
import { generateDemoOffers } from "../mock/generator";
import { searchLive } from "./client";
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

  isDemo(): boolean {
    return !this.apiKey();
  }

  async searchFlights(query: FlightSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]> {
    const apiKey = this.apiKey();
    if (!apiKey) return generateDemoOffers(query, { provider: this.name, bias: 0.97 });

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
      return { provider: this.name, status: "api_required", message: "SKYSCANNER_API_KEY 없음 — DEMO DATA 사용 중", checkedAt };
    }
    // A real ping would consume quota; report configured state only.
    return { provider: this.name, status: "connected", message: "API Key 설정됨 (실호출 미검증)", checkedAt };
  }
}
