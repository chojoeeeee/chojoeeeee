import { timingSafeEqual } from "node:crypto";

export type AdminAccess = "allow" | "challenge" | "hidden";

/**
 * Who may open /admin:
 *  - ADMIN_PASSWORD set → HTTP Basic auth with that password (any user name), else a 401 challenge.
 *  - not set + production → hidden (404): the admin area simply does not exist for visitors.
 *  - not set + development → open, for local work.
 */
export function adminAccess(input: { password?: string; nodeEnv?: string; authorization?: string | null }): AdminAccess {
  if (!input.password) return input.nodeEnv === "production" ? "hidden" : "allow";
  const header = input.authorization ?? "";
  if (!header.startsWith("Basic ")) return "challenge";
  let given = "";
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    given = decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return "challenge";
  }
  const a = Buffer.from(given);
  const b = Buffer.from(input.password);
  return a.length === b.length && timingSafeEqual(a, b) ? "allow" : "challenge";
}
