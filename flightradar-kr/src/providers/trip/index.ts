import "server-only";
import { env } from "@/lib/env";
import type { FlightOffer, FlightSearchQuery, ProviderHealth } from "@/types/domain";
import { ProviderUnavailableError, type FlightProvider } from "../types";
import { generateDemoOffers } from "../mock/generator";

/**
 * Trip.com provider. No official API / partner approval has been confirmed,
 * so only mock mode exists. When approval arrives, implement the `live`
 * branch here (plus mapper.ts / types.ts) — nothing else needs to change.
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
    return this.mode() === "mock";
  }

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    if (this.mode() === "mock") return generateDemoOffers(query, { provider: this.name, bias: 0.99 });
    throw new ProviderUnavailableError(this.name, "partner_required", "Trip.com live 연동은 아직 구현되지 않았습니다 (파트너 승인 필요)");
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: this.mode() === "mock" ? "partner_required" : "unavailable",
      message: this.mode() === "mock" ? "파트너/제휴 승인 전 — DEMO DATA 사용 중" : "live 모드 미구현",
      checkedAt: new Date().toISOString(),
    };
  }
}
