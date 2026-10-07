import "server-only";
import { env } from "@/lib/env";
import type { FlightOffer, FlightSearchQuery, ProviderHealth } from "@/types/domain";
import { demoEnabled } from "../demo-mode";
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
    return this.mode() === "mock" && demoEnabled();
  }

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    if (this.mode() === "mock" && demoEnabled()) return generateDemoOffers(query, { provider: this.name, bias: 1.0 });
    throw new ProviderUnavailableError(this.name, "partner_required", "Trip.com 제휴/파트너 승인 전입니다 (live 연동 미구현)");
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "partner_required",
      message: this.mode() === "mock" ? (demoEnabled() ? "파트너/제휴 승인 전 — DEMO DATA 사용 중" : "파트너/제휴 승인 전") : "live 모드 미구현",
      checkedAt: new Date().toISOString(),
    };
  }
}
