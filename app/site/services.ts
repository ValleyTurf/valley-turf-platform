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
      "Turf fluff and cleaning, pressure washing stuck messes, edge cleaning, debris removal, and power brooming that restores color, softness, and drainage.",
  },
  {
    slug: "pet-odor-removal",
    name: "Pet Odor Removal",
    shortDescription:
      "We eliminate pet odor at the source, not just mask it for a week — a deep clean that targets the bacteria trapped in the infill.",
  },
];

export function getService(slug: string): ServiceInfo | undefined {
  return SERVICES.find((service) => service.slug === slug);
}

// The full task list from the old Jobber-hosted site's "Some of the
// services we offer" section (goldenturfcare.jobbersites.com) -- Ryan
// specifically asked to keep this real wording rather than the shorter
// two-service framing above. Shown as a checklist on the homepage and
// the Turf Cleaning service page; the two SERVICES above stay the
// quote-able/schedulable "products," this is the granular breakdown of
// what's actually done during a visit.
export const TURF_TASKS: string[] = [
  "Turf Fluff and Cleaning",
  "Pressure Wash Stuck Messes",
  "Edge Cleaning",
  "Debris Removal",
  "Power Broom",
  "Odor Control",
  "Turf Brushing",
  "Infill Replacement",
  "Lawn Inspection",
];
