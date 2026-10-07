export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-800 ${className}`}>
      DEMO DATA
    </span>
  );
}
