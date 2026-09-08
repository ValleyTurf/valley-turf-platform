// Jobber Independence Roadmap -- data source for /services and the
// individual service pages + sitemap.xml. Only two services exist
// anywhere else in this codebase (job_service_category values, quote
// pricing tiers) -- if that changes, add the new one here and it flows
// through automatically.
export type ServiceInfo = {
  slug: string;
  name: string;
  shortDescription: string;
};

export const SERVICES: ServiceInfo[] = [
  {
    slug: "turf-cleaning",
    name: "Turf Cleaning",
    shortDescription:
      "Deep cleaning and rinsing for artificial turf that removes dirt, debris, and buildup, restoring color and softness.",
  },
  {
    slug: "pet-odor-removal",
    name: "Pet Odor Removal",
    shortDescription:
      "Targeted treatment that breaks down the bacteria trapped in artificial turf infill that cause lingering pet odor.",
  },
];

export function getService(slug: string): ServiceInfo | undefined {
  return SERVICES.find((service) => service.slug === slug);
}
