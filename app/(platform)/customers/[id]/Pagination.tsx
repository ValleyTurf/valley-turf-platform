// Reusable Prev/Next + numbered-page control for the "recent stuff"
// lists on the customer page (Past Visits, Payment History, Recent
// Invoices, Native Invoices, Recent Jobs, Recent Quotes) -- Ryan
// (2026-09-20) wanted real click-to-page-2/3 pagination instead of the
// old "showing the 5 most recent of N" footnote each section had on its
// own (see page.tsx's LIST_PAGE_SIZE/paginateList).
//
// A plain server component (Link, not "use client") since this is just
// navigation to a new URL, not a value that needs to sync into client
// state -- see ProfitTimeframePicker.tsx for the sibling pattern used
// where an actual controlled value (a timeframe, a margin target) is
// picked instead of a page.
//
// Every href is built from the FULL current search params, not just
// this list's own paramName, so paging one section leaves every other
// section's page -- and the Profitability panel's own
// profitRange/marginTarget -- untouched. page.tsx builds that object
// once (currentSearchParams) and passes it to every <Pagination> on
// the page.
import Link from "next/link";

type PaginationSearchParams = Record<string, string | undefined>;

function hrefForPage(
  searchParams: PaginationSearchParams,
  paramName: string,
  page: number
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) {
      params.set(key, value);
    }
  }

  // Page 1 is the default -- omit the param entirely rather than
  // writing "?jobsPage=1", so a freshly-loaded page and its own "back
  // to page 1" link both produce the same clean URL.
  if (page <= 1) {
    params.delete(paramName);
  } else {
    params.set(paramName, String(page));
  }

  const query = params.toString();
  return query ? `?${query}` : "?";
}

// Keeps the page-number row short even with many pages: always the
// first and last page, the current page and its immediate neighbors,
// and an ellipsis for whatever's skipped in between.
function pageNumbersToShow(
  currentPage: number,
  totalPages: number
): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([
    1,
    totalPages,
    currentPage,
    currentPage - 1,
    currentPage + 1,
  ]);

  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]);
  }

  return result;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  paramName,
  searchParams,
  itemLabel,
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  paramName: string;
  searchParams: PaginationSearchParams;
  itemLabel: string;
}) {
  if (totalCount === 0) return null;

  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#f0eee6] pt-3">
      <p className="text-xs text-[#6b705c]">
        Showing {rangeStart}
        {rangeEnd > rangeStart ? `–${rangeEnd}` : ""} of {totalCount}{" "}
        {itemLabel}
        {totalCount === 1 ? "" : "s"}
      </p>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1">
          {currentPage > 1 ? (
            <Link
              href={hrefForPage(searchParams, paramName, currentPage - 1)}
              scroll={false}
              className="rounded-lg px-2 py-1 text-xs font-bold text-[#174734] hover:bg-[#f7f6f1]"
            >
              Prev
            </Link>
          ) : (
            <span className="rounded-lg px-2 py-1 text-xs font-bold text-[#d9d4c6]">
              Prev
            </span>
          )}

          {pageNumbersToShow(currentPage, totalPages).map((page, index) =>
            page === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-xs text-[#6b705c]"
              >
                …
              </span>
            ) : (
              <Link
                key={page}
                href={hrefForPage(searchParams, paramName, page)}
                scroll={false}
                aria-current={page === currentPage ? "page" : undefined}
                className={`rounded-lg px-2 py-1 text-xs font-bold ${
                  page === currentPage
                    ? "bg-[#174734] text-white"
                    : "text-[#174734] hover:bg-[#f7f6f1]"
                }`}
              >
                {page}
              </Link>
            )
          )}

          {currentPage < totalPages ? (
            <Link
              href={hrefForPage(searchParams, paramName, currentPage + 1)}
              scroll={false}
              className="rounded-lg px-2 py-1 text-xs font-bold text-[#174734] hover:bg-[#f7f6f1]"
            >
              Next
            </Link>
          ) : (
            <span className="rounded-lg px-2 py-1 text-xs font-bold text-[#d9d4c6]">
              Next
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
