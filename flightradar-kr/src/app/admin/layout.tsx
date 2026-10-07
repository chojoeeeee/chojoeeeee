import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-soft px-4 py-2 text-xs font-semibold text-muted" aria-label="관리자 메뉴">
        <span className="text-fg">관리자</span>
        <Link href="/admin">개요</Link>
        <Link href="/admin/providers">공급처</Link>
        <Link href="/admin/watchlists">Watchlist</Link>
        <Link href="/admin/search">검색 점검</Link>
      </nav>
      {children}
    </div>
  );
}
