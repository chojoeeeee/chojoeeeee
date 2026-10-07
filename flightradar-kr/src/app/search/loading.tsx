export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="항공권 검색 중">
      <div className="h-6 w-40 rounded bg-slate-200" />
      <div className="h-10 rounded-xl bg-slate-200" />
      <div className="h-24 rounded-2xl bg-slate-200" />
      {[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-2xl bg-slate-200" />)}
    </div>
  );
}
