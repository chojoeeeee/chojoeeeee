import "server-only";
import { env } from "@/lib/env";
import type { FlightOffer, FlightSearchQuery, ProviderHealth } from "@/types/domain";
import { demoEnabled } from "../demo-mode";
import { ProviderUnavailableError, type FlightProvider } from "../types";
import { generateDemoOffers } from "../mock/generator";

/**
 * Trip.com provider (classification B: API exists, credentials after a partner
 * agreement). Only mock mode works until the agreement exists AND the Shopping
 * Offer schema is read; then implement the `live` branch here (+ mapper.ts / types.ts).
 */
export class TripProvider implements FlightProvider {
  readonly name = "trip";
  readonly displayName = "Trip.com";

  isEnabled(): boolean {
    return true;
  }

  private mode(): "mock" | "live" {
    return env("TRIP_PROVIDER_MODE") === "live" ? "live" : "mock";
  }

  isDemo(): boolean {
    return this.mode() === "mock" && demoEnabled();
  }

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    if (this.mode() === "mock" && demoEnabled()) return generateDemoOffers(query, { provider: this.name, bias: 1.0 });
    if (this.mode() === "live" && env("TRIP_APP_KEY") && env("TRIP_APP_SECRET")) {
      // Credentials exist, but the Shopping Offer request/response schema has not been read yet
      // (developers.trip.com was not reachable from the dev environment) → no guessing.
      throw new ProviderUnavailableError(this.name, "unavailable", "Trip.com 자격증명은 설정됐지만 Shopping API 매퍼가 아직 구현되지 않았습니다 (developers.trip.com/flight 문서 확인 필요).");
    }
    throw new ProviderUnavailableError(this.name, "partner_required", "Trip.com Flight API는 파트너 협약 후 appKey/appSecret이 발급됩니다 (developers.trip.com/flight). 승인 전입니다.");
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "partner_required",
      message: demoEnabled() && this.mode() === "mock" ? "파트너 협약 전 — DEMO DATA 사용 중" : "파트너 협약 필요 (appKey/appSecret)",
      checkedAt: new Date().toISOString(),
    };
  }
}
