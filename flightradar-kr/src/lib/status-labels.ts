import type { SourceStatus } from "@/features/flight-search/result";

/**
 * Status vocabulary, in two audiences:
 *  - `adminBadge`: the developer labels (LIVE / PUBLIC DEAL / DEMO / MANUAL / API REQUIRED / …) — /admin only.
 *  - `userStatus`: plain Korean for end users. Policy/connection internals never reach the user screens.
 */
type RowLike = { status: SourceStatus; isDemo: boolean; role: "flight" | "deal" };

export type AdminBadge = "LIVE" | "PUBLIC DEAL" | "DEMO" | "MANUAL" | "API REQUIRED" | "PARTNER REQUIRED" | "POLICY" | "ERROR";

export function adminBadge(row: RowLike): AdminBadge {
  switch (row.status) {
    case "manual_check":
      return "MANUAL";
    case "api_required":
      return "API REQUIRED";
    case "partner_required":
      return "PARTNER REQUIRED";
    case "policy_skipped":
      return "POLICY";
    case "unavailable":
    case "timeout":
    case "error":
      return "ERROR";
    default:
      return row.isDemo ? "DEMO" : row.role === "deal" ? "PUBLIC DEAL" : "LIVE";
  }
}

export type UserTone = "live" | "test" | "pending" | "manual" | "problem" | "empty";

export interface UserStatus {
  text: string;
  tone: UserTone;
  /** True when the service returned data to show. */
  hasData: boolean;
}

/** Plain-language status for end users. `undefined` = do not show this service at all. */
export function userStatus(row: RowLike): UserStatus | undefined {
  switch (row.status) {
    case "policy_skipped":
      return undefined; // internal: a background call that was not allowed — never user-facing
    case "api_required":
      return { text: "현재 자동 조회 준비 중", tone: "pending", hasData: false };
    case "partner_required":
      return { text: "제휴 연결 준비 중", tone: "pending", hasData: false };
    case "manual_check":
      return { text: "직접 확인", tone: "manual", hasData: false };
    case "timeout":
    case "error":
    case "unavailable":
      return { text: "일시적으로 확인하지 못했어요", tone: "problem", hasData: false };
    case "no_results":
      return { text: row.role === "deal" ? "지금 맞는 특가가 없어요" : "조건에 맞는 항공권이 없어요", tone: "empty", hasData: false };
    default:
      return row.isDemo ? { text: "테스트 데이터", tone: "test", hasData: true } : { text: row.role === "deal" ? "공개 특가" : "실시간 확인", tone: "live", hasData: true };
  }
}
