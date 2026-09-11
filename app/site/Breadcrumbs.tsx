import Link from "next/link";

const MUTED_GRAY = "#6b705c";
const BRAND_GREEN = "#174734";

export type BreadcrumbItem = { name: string; path: string };

// Visible breadcrumb trail. Shared by every page under app/site that has
// more than one level of hierarchy (service pages, city pages, and the
// new service x city combo pages) -- rendered from the same item list
// that feeds buildBreadcrumbSchema (see breadcrumbSchema.ts), per
// Google's own guidance that BreadcrumbList structured data should match
// real, visible on-page navigation rather than being invented separately.
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
        {items.map((item, index) => (
          <li key={item.path} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden style={{ color: MUTED_GRAY }}>
                /
              </span>
            )}
            {index === items.length - 1 ? (
              <span style={{ color: BRAND_GREEN }}>{item.name}</span>
            ) : (
              <Link href={item.path} className="hover:underline" style={{ color: MUTED_GRAY }}>
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
