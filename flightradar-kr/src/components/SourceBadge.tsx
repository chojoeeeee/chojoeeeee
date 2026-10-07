import { getProfile } from "@/config/source-profiles";
import type { SourceRow, SourceStatus } from "@/features/flight-search/result";

export type BadgeKind = "LIVE" | "DEMO" | "MANUAL" | "API REQUIRED" | "PARTNER REQUIRED" | "ERROR";

/** One unmistakable label per source so real and test data can never be confused. */
export function badgeFor(row: Pick<SourceRow, "status" | "isDemo">): BadgeKind {
  const s: SourceStatus = row.status;
  if (s === "manual_check") return "MANUAL";
  if (s === "api_required") return "API REQUIRED";
  if (s === "partner_required") return "PARTNER REQUIRED";
  if (s === "unavailable" || s === "timeout" || s === "error") return "ERROR";
  return row.isDemo ? "DEMO" : "LIVE";
}

const STYLE: Record<BadgeKind, string> = {
  LIVE: "bg-green-100 text-green-800",
  DEMO: "bg-amber-100 text-amber-800",
  MANUAL: "bg-slate-200 text-slate-700",
  "API REQUIRED": "bg-blue-100 text-blue-800",
  "PARTNER REQUIRED": "bg-purple-100 text-purple-800",
  ERROR: "bg-red-100 text-red-800",
};

export function SourceBadge({ row }: { row: Pick<SourceRow, "status" | "isDemo"> }) {
  const kind = badgeFor(row);
  return <span className={`ml-2 inline-block rounded px-1.5 py-0.5 align-middle text-[11px] font-bold tracking-wide ${STYLE[kind]}`}>{kind}</span>;
}

/** Research-based connection state, e.g. "API 연결 준비 완료 — API Key 필요". */
export function connectionLabel(provider: string): string | undefined {
  return getProfile(provider)?.connectionLabel;
}
