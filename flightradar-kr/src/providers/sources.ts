import "server-only";
import type { SourceProvider } from "./types";
import { SkyscannerProvider } from "./skyscanner";
import { TripProvider } from "./trip";
import { catchfrog } from "./catchfrog";
import { playwings } from "./playwings";
import { chulguk } from "./chulguk";
import { aliFlight } from "./ali-flight";

const skyscanner = new SkyscannerProvider();
const trip = new TripProvider();

/**
 * The six services the product exists for. This list is fixed on purpose:
 * every search attempts ALL of them. A service that cannot be queried
 * automatically stays here and reports `manual_check` / `api_required` / …
 */
export function getSources(): SourceProvider[] {
  return [
    catchfrog,
    {
      name: skyscanner.name,
      displayName: skyscanner.displayName,
      role: "flight",
      checkUrl: "https://www.skyscanner.co.kr",
      checkLabel: "사이트에서 직접 확인",
      // Skyscanner's public URL scheme: /transport/flights/<from>/<to>/<yymmdd>/<yymmdd>/
      directUrl: (s) => {
        const d = (x: string) => x.slice(2).replaceAll("-", "");
        const path = `${s.origin.toLowerCase()}/${s.destination.toLowerCase()}/${d(s.departureDate)}/${s.returnDate ? `${d(s.returnDate)}/` : ""}`;
        return `https://www.skyscanner.co.kr/transport/flights/${path}?adultsv2=${s.adults}`;
      },
      flight: skyscanner,
    },
    playwings,
    chulguk,
    aliFlight,
    {
      name: trip.name,
      displayName: trip.displayName,
      role: "flight",
      checkUrl: "https://kr.trip.com/flights/",
      checkLabel: "사이트에서 직접 확인",
      directUrl: () => "https://kr.trip.com/flights/",
      flight: trip,
    },
  ];
}
