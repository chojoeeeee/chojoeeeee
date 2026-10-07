/**
 * Output of the official FlyAI CLI (`flyai search-flight`, @fly-ai/flyai-cli, MIT,
 * published by Alibaba Fliggy). Shape taken from the CLI's own reference doc
 * (alibaba-flyai/flyai-skill → references/search-flight.md). Not yet run against the
 * live service from this environment.
 */
export interface FlyaiSegment {
  depStationCode?: string; // IATA, e.g. "ICN"
  depDateTime?: string; // "2026-03-28 21:00:00" local time
  arrStationCode?: string;
  arrDateTime?: string;
  duration?: string; // "140分钟"
  marketingTransportName?: string; // "国航"
  marketingTransportNo?: string; // "CA1883"
  seatClassName?: string;
}

export interface FlyaiJourney {
  journeyType?: string; // "直达" = direct
  segments?: FlyaiSegment[];
  totalDuration?: string;
}

export interface FlyaiItem {
  /** e.g. "¥400.0" — Chinese yuan, per adult. */
  adultPrice?: string;
  journeys?: FlyaiJourney[];
  jumpUrl?: string;
  totalDuration?: string;
}

export interface FlyaiFlightResponse {
  data?: { itemList?: FlyaiItem[] };
  message?: string;
  status?: number;
}
