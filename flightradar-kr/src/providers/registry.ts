import "server-only";
import type { DealProvider, FlightProvider } from "./types";
import { SkyscannerProvider } from "./skyscanner";
import { TripProvider } from "./trip";
import { mockProviderA, mockProviderB } from "./mock";
import { catchfrogProvider } from "./catchfrog";
import { playwingsProvider } from "./playwings";
import { chulgukProvider } from "./chulguk";
import { aliFlightProvider } from "./ali-flight";

/** Register a new provider here — nothing else in the app needs to change. */
export function getFlightProviders(): FlightProvider[] {
  return [new SkyscannerProvider(), new TripProvider(), mockProviderA, mockProviderB].filter((p) => p.isEnabled());
}

export function getDealProviders(): DealProvider[] {
  return [catchfrogProvider, playwingsProvider, chulgukProvider, aliFlightProvider].filter((p) => p.isEnabled());
}
