import { SITE_URL } from "../config";
import { SERVICES } from "../services";
import { SERVICE_AREAS } from "../serviceAreas";

// Same host-routing reasoning as ../robots.txt/route.ts -- Next's
// built-in sitemap() convention has no host context, so this is a plain
// route handler reached only via proxy.ts's marketingRewritePath when
// the Host is the marketing domain.
export async function GET() {
  const staticPaths = ["/", "/services", "/about", "/reviews", "/service-areas"];
  const servicePaths = SERVICES.map((service) => `/services/${service.slug}`);
  const cityPaths = SERVICE_AREAS.map((area) => `/service-areas/${area.slug}`);

  const urls = [...staticPaths, ...servicePaths, ...cityPaths];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}
