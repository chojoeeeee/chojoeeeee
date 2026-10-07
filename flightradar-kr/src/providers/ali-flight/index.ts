import "server-only";
import { getAirport } from "@/config/airports";
import { env, envInt } from "@/lib/env";
import type { CabinClass, FlightOffer, FlightSearchQuery, ProviderHealth } from "@/types/domain";
import { demoEnabled } from "../demo-mode";
import { generateDemoOffers } from "../mock/generator";
import { ProviderUnavailableError, type FlightProvider, type SearchContext, type SourceProvider } from "../types";
import { runFlyaiCli } from "./cli";
import { mapFlyaiResponse } from "./mapper";

const NAME = "ali-flight";
const MANUAL_REASON =
  "알리항공권(AliExpress Travel)의 공개 API/제휴는 확인되지 않았습니다. 공급원인 Fliggy의 공식 FlyAI CLI를 쓰려면 ALI_PROVIDER_MODE=flyai 와 FX_CNY_KRW(환율)를 설정하세요.";

const SEAT_CLASS: Partial<Record<CabinClass, string>> = { economy: "经济舱", business: "商务舱", first: "头等舱" };

/**
 * 알리항공권 = AliExpress Travel's flights, whose inventory comes from Alibaba's Fliggy.
 * Real data path: Fliggy's official, MIT-licensed FlyAI CLI. It returns CNY prices for
 * Fliggy's inventory — NOT necessarily the KRW price AliExpress Travel Korea shows —
 * so it is strictly opt-in (ALI_PROVIDER_MODE=flyai) and results carry low confidence.
 */
export class AliFlightProvider implements FlightProvider {
  readonly name = NAME;
  readonly displayName = "알리항공권";

  isEnabled(): boolean {
    return true;
  }

  private live(): boolean {
    return env("ALI_PROVIDER_MODE") === "flyai";
  }

  isDemo(): boolean {
    return !this.live() && demoEnabled();
  }

  async searchFlights(query: FlightSearchQuery, ctx?: SearchContext): Promise<FlightOffer[]> {
    if (!this.live()) {
      if (demoEnabled()) return generateDemoOffers(query, { provider: NAME, bias: 1.12 });
      throw new ProviderUnavailableError(NAME, "manual_check", MANUAL_REASON);
    }
    if (!env("FX_CNY_KRW")) throw new ProviderUnavailableError(NAME, "unavailable", "FX_CNY_KRW(위안→원 환율) 설정이 필요합니다. 환율은 임의로 가정하지 않습니다.");
    const from = getAirport(query.origin)?.cityZh;
    const to = getAirport(query.destination)?.cityZh;
    const seat = SEAT_CLASS[query.cabinClass];
    if (!from || !to) throw new ProviderUnavailableError(NAME, "unavailable", "이 공항은 FlyAI 도시명 매핑이 없습니다.");
    if (!seat) throw new ProviderUnavailableError(NAME, "unavailable", "이 좌석 등급은 아직 지원하지 않습니다.");

    const args = ["search-flight", "--origin", from, "--destination", to, "--dep-date", query.departureDate, "--seat-class-name", seat, "--sort-type", "3"];
    if (query.returnDate) args.push("--back-date", query.returnDate);
    if (query.directOnly) args.push("--journey-type", "1");

    const res = await runFlyaiCli(args, { binary: env("FLYAI_CLI_PATH") ?? "flyai", timeoutMs: envInt("PROVIDER_TIMEOUT_MS", 8000), signal: ctx?.signal });
    return mapFlyaiResponse(res, query, new Date().toISOString());
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.live()) {
      return { provider: NAME, status: "manual_check", message: demoEnabled() ? "DEMO DATA 사용 중 (FlyAI 옵트인 전)" : MANUAL_REASON, checkedAt };
    }
    return { provider: NAME, status: "connected", message: "FlyAI(Fliggy) 옵트인됨 — CNY 가격, 실호출 미검증", checkedAt };
  }
}

const flight = new AliFlightProvider();

export const aliFlight: SourceProvider = {
  name: NAME,
  displayName: "알리항공권",
  checkUrl: "https://www.aliexpress.com",
  checkLabel: "알리익스프레스에서 직접 확인",
  directUrl: () => "https://www.aliexpress.com",
  flight,
};
