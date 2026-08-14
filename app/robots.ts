import type { MetadataRoute } from "next";

// Internal business tool, not a public site -- disallow crawling
// entirely rather than picking and choosing routes. Paired with the
// noindex directive in app/layout.tsx's metadata: this stops search
// engines from crawling in the first place, the noindex tag is what
// actually gets an already-indexed page (the public /login redirect
// target, which is how this showed up in a Google search) dropped from
// results even if a crawler reaches a URL some other way.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
