// Next.js automatically wraps the page content for every route under
// (platform) in a Suspense boundary using this as the fallback — so
// instead of a blank white screen while a page's data loads (Customers,
// the Jobber Sync page, etc.), people see this immediately. The sidebar
// itself isn't affected since it lives in the layout, outside this
// boundary.
export default function PlatformLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f4ef]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d9d4c6] border-t-[#174734]" />
        <p className="text-sm font-semibold text-[#6b705c]">Loading…</p>
      </div>
    </main>
  );
}
