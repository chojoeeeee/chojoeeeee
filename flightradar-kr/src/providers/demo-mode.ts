import "server-only";
import { env } from "@/lib/env";

/** DEMO_MODE=true lets providers without a key/approval return DEMO DATA. Off by default. */
export function demoEnabled(): boolean {
  const v = env("DEMO_MODE")?.toLowerCase();
  return v === "true" || v === "1";
}
