import type { UserTone } from "@/lib/status-labels";

const STYLE: Record<UserTone, string> = {
  live: "bg-green-50 text-green-700",
  test: "bg-amber-50 text-amber-700",
  pending: "bg-blue-50 text-blue-700",
  manual: "bg-soft text-muted",
  problem: "bg-soft text-muted",
  empty: "bg-soft text-muted",
};

/** Small status label shown to end users (plain Korean, no developer terms). */
export function Pill({ tone, children }: { tone: UserTone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STYLE[tone]}`}>{children}</span>;
}
