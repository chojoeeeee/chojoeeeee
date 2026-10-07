"use client";

export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
      <p className="font-semibold">검색 중 문제가 발생했어요.</p>
      <p className="mt-1">잠시 후 다시 시도해주세요.</p>
      <button onClick={reset} className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-white">다시 시도</button>
    </div>
  );
}
