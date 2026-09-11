import { SITE_URL } from "./config";
import type { BreadcrumbItem } from "./Breadcrumbs";

// BreadcrumbList JSON-LD -- lets a search result show the page's
// breadcrumb trail (e.g. "Services > Turf Cleaning > Gilbert") instead
// of the raw URL. Built from the exact same item list the visible
// <Breadcrumbs> component renders (see Breadcrumbs.tsx), so the
// structured data can never drift from what a visitor actually sees.
export function buildBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
