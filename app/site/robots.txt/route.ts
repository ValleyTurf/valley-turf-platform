import { SITE_URL } from "../config";

// Reached only via proxy.ts's marketingRewritePath rewriting
// {marketing-domain}/robots.txt here -- the CRM's own /robots.txt
// (app/robots.ts, unconditional disallow-all) keeps serving normally on
// go.valleyturfrevival.com and everywhere else, since Next's built-in
// robots() convention has no request/host context to branch on itself.
export async function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
