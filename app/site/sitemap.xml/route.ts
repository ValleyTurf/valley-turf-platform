import { SITE_URL } from "../config";
import { SERVICES } from "../services";
import { SERVICE_AREAS } from "../serviceAreas";

// Same host-routing reasoning as ../robots.txt/route.ts -- Next's
// built-in sitemap() convention has no host context, so this is a plain
// route handler reached only via proxy.ts's marketingRewritePath when
// the Host is the marketing domain.

// Force this route to be generated once at build/deploy time rather than
// re-run per request. That's what makes LAST_MOD below meaningful: it's
// computed once when the site is actually (re)built, not recalculated on
// every crawl. None of this sitemap's underlying data (services.ts,
// serviceAreas.ts) has its own real "last edited" timestamp to draw
// from -- there's no CMS here -- so "the date this deployment was built"
// is the most accurate honest date available, and it updates itself
// automatically on every real deploy with no manual bookkeeping. Stamping
// "now" on every request instead would be actively misleading (it would
// claim the content changed every single day, even on days nothing
// shipped).
export const dynamic = "force-static";

const LAST_MOD = new Date().toISOString().slice(0, 10);

export async function GET() {
  const staticPaths = ["/", "/services", "/about", "/reviews", "/service-areas"];
  const servicePaths = SERVICES.map((service) => `/services/${service.slug}`);
  const cityPaths = SERVICE_AREAS.map((area) => `/service-areas/${area.slug}`);
  // Service x city combination pages (app/site/services/[service]/[city]/
  // page.tsx) -- 2 services x 29 cities.
  const comboPaths = SERVICES.flatMap((service) =>
    SERVICE_AREAS.map((area) => `/services/${service.slug}/${area.slug}`)
  );

  const urls = [...staticPaths, ...servicePaths, ...cityPaths, ...comboPaths];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${SITE_URL}${path}</loc><lastmod>${LAST_MOD}</lastmod></url>`).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}
