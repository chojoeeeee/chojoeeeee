export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 pt-2" aria-busy="true" aria-label="항공권 검색 중">
      <div className="h-8 w-48 rounded-lg bg-soft" />
      <div className="h-40 rounded-3xl bg-soft" />
      <div className="h-32 rounded-2xl bg-soft" />
      <div className="h-32 rounded-2xl bg-soft" />
    </div>
  );
}
