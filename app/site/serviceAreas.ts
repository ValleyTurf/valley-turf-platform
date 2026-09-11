// Jobber Independence Roadmap -- data source for the /service-areas
// index page and the /service-areas/[city] dynamic route
// (generateStaticParams pulls straight from this list). Coverage per
// Ryan: "Valley wide. Queen Creek to Buckeye up to New River down to
// Maricopa/Casa Grande and everything in between" -- grouped by region
// just for the index page's layout, not used for anything functional.
export type ServiceArea = {
  slug: string;
  name: string;
  region: "East Valley" | "Southeast Valley & Pinal County" | "Central Phoenix" | "West Valley" | "North Valley";
  // SEO content buildout: a real photo from marketing-assets/public/images
  // to use as that page's hero image, and a flag for whether the page has
  // been through the buildout (hero + FAQ + LocalBusiness/FAQPage schema
  // -- see app/site/service-areas/[city]/page.tsx). Now rolled out to all
  // 29 cities after Ryan reviewed a 5-city sample batch. Photos cycle
  // through the real gallery/hero pool (10 images) -- none are claimed to
  // be *from* that specific city, same honesty rule as the homepage.
  // Ryan explicitly did NOT want distance/drive-time content (not a
  // concern for customers, reads as a downside) -- removed after his
  // review of the first pass, do not re-add.
  heroImage?: string;
  seoEnhanced?: boolean;
};

export const SERVICE_AREAS: ServiceArea[] = [
  // East Valley
  { slug: "queen-creek", name: "Queen Creek", region: "East Valley", seoEnhanced: true, heroImage: "/images/hero/hero-1.jpg" },
  { slug: "san-tan-valley", name: "San Tan Valley", region: "East Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-2.jpg" },
  { slug: "gilbert", name: "Gilbert", region: "East Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-1.jpg" },
  { slug: "chandler", name: "Chandler", region: "East Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-4.jpg" },
  { slug: "mesa", name: "Mesa", region: "East Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-6.jpg" },
  { slug: "tempe", name: "Tempe", region: "East Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-8.jpg" },
  { slug: "apache-junction", name: "Apache Junction", region: "East Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-9.jpg" },

  // Southeast Valley & Pinal County
  { slug: "maricopa", name: "Maricopa", region: "Southeast Valley & Pinal County", seoEnhanced: true, heroImage: "/images/gallery/gallery-1.jpg" },
  { slug: "casa-grande", name: "Casa Grande", region: "Southeast Valley & Pinal County", seoEnhanced: true, heroImage: "/images/gallery/gallery-3.jpg" },
  { slug: "coolidge", name: "Coolidge", region: "Southeast Valley & Pinal County", seoEnhanced: true, heroImage: "/images/gallery/gallery-2.jpg" },
  { slug: "florence", name: "Florence", region: "Southeast Valley & Pinal County", seoEnhanced: true, heroImage: "/images/gallery/gallery-4.jpg" },

  // Central Phoenix
  { slug: "phoenix", name: "Phoenix", region: "Central Phoenix", seoEnhanced: true, heroImage: "/images/hero/hero-1.jpg" },
  { slug: "scottsdale", name: "Scottsdale", region: "Central Phoenix", seoEnhanced: true, heroImage: "/images/gallery/gallery-3.jpg" },
  { slug: "paradise-valley", name: "Paradise Valley", region: "Central Phoenix", seoEnhanced: true, heroImage: "/images/gallery/gallery-5.jpg" },

  // West Valley
  { slug: "glendale", name: "Glendale", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-6.jpg" },
  { slug: "peoria", name: "Peoria", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-7.jpg" },
  { slug: "surprise", name: "Surprise", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-5.jpg" },
  { slug: "sun-city", name: "Sun City", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-8.jpg" },
  { slug: "sun-city-west", name: "Sun City West", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-9.jpg" },
  { slug: "avondale", name: "Avondale", region: "West Valley", seoEnhanced: true, heroImage: "/images/hero/hero-1.jpg" },
  { slug: "goodyear", name: "Goodyear", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-1.jpg" },
  { slug: "litchfield-park", name: "Litchfield Park", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-2.jpg" },
  { slug: "buckeye", name: "Buckeye", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-3.jpg" },
  { slug: "el-mirage", name: "El Mirage", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-4.jpg" },
  { slug: "youngtown", name: "Youngtown", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-6.jpg" },
  { slug: "tolleson", name: "Tolleson", region: "West Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-7.jpg" },

  // North Valley
  { slug: "cave-creek", name: "Cave Creek", region: "North Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-7.jpg" },
  { slug: "carefree", name: "Carefree", region: "North Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-8.jpg" },
  { slug: "fountain-hills", name: "Fountain Hills", region: "North Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-9.jpg" },
  { slug: "anthem", name: "Anthem", region: "North Valley", seoEnhanced: true, heroImage: "/images/hero/hero-1.jpg" },
  { slug: "new-river", name: "New River", region: "North Valley", seoEnhanced: true, heroImage: "/images/gallery/gallery-1.jpg" },
];

export function getServiceArea(slug: string): ServiceArea | undefined {
  return SERVICE_AREAS.find((area) => area.slug === slug);
}

export const SERVICE_AREA_REGIONS = Array.from(
  new Set(SERVICE_AREAS.map((area) => area.region))
) as ServiceArea["region"][];
