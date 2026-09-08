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
};

export const SERVICE_AREAS: ServiceArea[] = [
  // East Valley
  { slug: "queen-creek", name: "Queen Creek", region: "East Valley" },
  { slug: "san-tan-valley", name: "San Tan Valley", region: "East Valley" },
  { slug: "gilbert", name: "Gilbert", region: "East Valley" },
  { slug: "chandler", name: "Chandler", region: "East Valley" },
  { slug: "mesa", name: "Mesa", region: "East Valley" },
  { slug: "tempe", name: "Tempe", region: "East Valley" },
  { slug: "apache-junction", name: "Apache Junction", region: "East Valley" },

  // Southeast Valley & Pinal County
  { slug: "maricopa", name: "Maricopa", region: "Southeast Valley & Pinal County" },
  { slug: "casa-grande", name: "Casa Grande", region: "Southeast Valley & Pinal County" },
  { slug: "coolidge", name: "Coolidge", region: "Southeast Valley & Pinal County" },
  { slug: "florence", name: "Florence", region: "Southeast Valley & Pinal County" },
  { slug: "eloy", name: "Eloy", region: "Southeast Valley & Pinal County" },

  // Central Phoenix
  { slug: "phoenix", name: "Phoenix", region: "Central Phoenix" },
  { slug: "scottsdale", name: "Scottsdale", region: "Central Phoenix" },
  { slug: "paradise-valley", name: "Paradise Valley", region: "Central Phoenix" },

  // West Valley
  { slug: "glendale", name: "Glendale", region: "West Valley" },
  { slug: "peoria", name: "Peoria", region: "West Valley" },
  { slug: "surprise", name: "Surprise", region: "West Valley" },
  { slug: "sun-city", name: "Sun City", region: "West Valley" },
  { slug: "sun-city-west", name: "Sun City West", region: "West Valley" },
  { slug: "avondale", name: "Avondale", region: "West Valley" },
  { slug: "goodyear", name: "Goodyear", region: "West Valley" },
  { slug: "litchfield-park", name: "Litchfield Park", region: "West Valley" },
  { slug: "buckeye", name: "Buckeye", region: "West Valley" },
  { slug: "el-mirage", name: "El Mirage", region: "West Valley" },
  { slug: "youngtown", name: "Youngtown", region: "West Valley" },
  { slug: "tolleson", name: "Tolleson", region: "West Valley" },

  // North Valley
  { slug: "cave-creek", name: "Cave Creek", region: "North Valley" },
  { slug: "carefree", name: "Carefree", region: "North Valley" },
  { slug: "fountain-hills", name: "Fountain Hills", region: "North Valley" },
  { slug: "anthem", name: "Anthem", region: "North Valley" },
  { slug: "new-river", name: "New River", region: "North Valley" },
];

export function getServiceArea(slug: string): ServiceArea | undefined {
  return SERVICE_AREAS.find((area) => area.slug === slug);
}

export const SERVICE_AREA_REGIONS = Array.from(
  new Set(SERVICE_AREAS.map((area) => area.region))
) as ServiceArea["region"][];
