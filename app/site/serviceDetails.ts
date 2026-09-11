// Shared service copy -- used by both the per-service detail page
// (app/site/services/[service]/page.tsx) and the new service x city
// combination pages (app/site/services/[service]/[city]/page.tsx).
// Pulled out of the service detail page itself so the combo pages can
// import it too, without adding a non-page named export to a page.tsx
// file (Next.js App Router keeps page.tsx exports to the reserved set:
// the default component, metadata, generateMetadata,
// generateStaticParams, and route segment config).
//
// Sourcing note (unchanged from where this used to live): pet-odor-removal's
// copy is lifted verbatim (Ryan's request) from the old Jobber-hosted
// site's own Pet Odor Removal page
// (goldenturfcare.jobbersites.com/services/pet-odor-removal) -- that's
// the one service that already had its own dedicated page there.
// turf-cleaning has no equivalent page on the old site (it was just the
// homepage's general framing), so its copy is adapted from that same
// site's homepage service list, pricing FAQ, and Revival plan wording
// rather than invented from scratch -- same voice, same real business
// facts, just assembled into the same section shape as the real
// pet-odor-removal page for consistency between the two service pages.
export type ServiceDetails = {
  intro: string;
  featured: { title: string; body: string }[];
  included: { title: string; body: string }[];
  whyHeading: string;
  whyParagraphs: string[];
  faq: { q: string; a: string }[];
  beforeAfter?: { before: string; after: string }[];
};

export const SERVICE_DETAILS: Record<string, ServiceDetails> = {
  "turf-cleaning": {
    intro:
      "Turf Fluff and Cleaning, Pressure Wash Stuck Messes, Edge Cleaning, Debris Removal, Power Broom, Turf Brushing, Infill Replacement, and a full Lawn Inspection — everything your artificial turf needs to look, drain, and feel like new again.",
    featured: [
      {
        title: "One Time Deep Clean",
        body: "For turf that's overdue for attention. A full reset that removes built-up dirt, debris, and buildup in a single visit.",
      },
      {
        title: "Recurring Plans",
        body: "Monthly, Every Other Month, Quarterly, or Semi-Annual visits that keep your turf looking fresh year-round.",
      },
      {
        title: "Affordable, Upfront Pricing",
        body: "Transparent pricing based on square footage — no surprises, and we don't require contracts.",
      },
    ],
    included: [
      {
        title: "Turf Fluff and Cleaning",
        body: "Lift flattened fibers and restore the color and softness foot traffic wears down.",
      },
      {
        title: "Pressure Wash Stuck Messes",
        body: "Blast away anything stuck to the blades that a garden hose alone won't budge.",
      },
      {
        title: "Edge Cleaning & Debris Removal",
        body: "Clear leaves, twigs, and everyday buildup along borders, pavers, and walls.",
      },
      {
        title: "Power Broom & Turf Brushing",
        body: "Groom blades upright and level the infill evenly across every section.",
      },
      {
        title: "Lawn Inspection",
        body: "We check drainage, seams, and infill level while we're there.",
      },
    ],
    whyHeading: "Why Artificial Turf Still Needs Cleaning",
    whyParagraphs: [
      "Artificial turf is low-maintenance, not no-maintenance. Dirt, dust, pollen, and everyday debris settle into the infill over time, flattening the blades, dulling the color, and blocking drainage.",
      "Our process pressure washes stuck messes, clears debris, and power brooms the blades back upright — restoring the color, softness, and drainage it had on day one.",
    ],
    faq: [
      {
        q: "Will my turf look and smell new again?",
        a: "Not all turf is the same. We do our best to fluff the turf back up to as good as new on the Initial Full Revival Cleaning. However, if the turf has not been cleaned in a while, results may not be fully seen until regular maintenance has taken place.",
      },
      {
        q: "How do you determine pricing for your services?",
        a: "Our pricing is based on the type of service, materials required, and the scope of the job. We provide transparent, upfront pricing before any work begins, so there are no surprises. All pricing is based on the amount of square feet you want serviced.",
      },
      {
        q: "Do you have recurring services?",
        a: "Yes! We have a Revival plan to fit everyone's needs! We start with a Full Revival Cleaning and then if you would like to set up a plan with us, we have Monthly, Every Other Month, Quarterly and Semi-Annual plans available. We also can build a custom plan for you!",
      },
      {
        q: "Do you require contracts?",
        a: "No, we don't have contracts, but do offer recurring services. We ask that if you decide to cancel that you do so at least 3 business days before your next service.",
      },
    ],
    beforeAfter: [
      { before: "/images/before-after/before-1.jpg", after: "/images/before-after/after-1.jpg" },
      { before: "/images/before-after/before-2.jpg", after: "/images/before-after/after-2.jpg" },
    ],
  },
  "pet-odor-removal": {
    intro:
      "Dogs and artificial turf can coexist. We eliminate pet odor at the source — not just mask it for a week.",
    featured: [
      {
        title: "One Time Deep Clean",
        body: "For turf that's overdue for attention. A full reset that removes built-up odor and debris in a single visit.",
      },
      {
        title: "Recurring Plans",
        body: "Monthly, bi-monthly, or quarterly visits that keep odor from ever building back up — ideal for multi-dog households.",
      },
      {
        title: "Family & Pet Safe",
        body: "All products used are safe for kids and pets to be back on the turf shortly after treatment.",
      },
    ],
    included: [
      {
        title: "Turf Sweep and Broom",
        body: "Lift fibers and remove debris that may be hidden in the turf.",
      },
      {
        title: "Remove Any Stuck Messes",
        body: "Power wash any messes from your pets that may be stuck to your turf.",
      },
      {
        title: "Infill Replenishment",
        body: "Pet friendly product helps stop urine odors, prevents bacteria, and helps turf blades keep their shape.",
      },
      {
        title: "Deodorizing & Disinfectant Spray",
        body: "Hydrogen peroxide-based deodorizing and disinfecting spray that kills the bacteria causing the odor.",
      },
      {
        title: "Optional Recurring Visits",
        body: "Set a recurring schedule that works for you to keep odor from building back up.",
      },
    ],
    whyHeading: "Why Does Artificial Turf Start to Smell?",
    whyParagraphs: [
      "Most pet odor doesn't sit on the surface — it soaks into the infill layer underneath the blades, where bacteria feeds on trapped urine and keeps producing odor long after the surface looks clean. A quick hose-down or surface spray only masks it temporarily.",
      "Our process is built to reach that layer: we pressure wash to loosen embedded residue, flush it out with a deep rinse, then treat with a hydrogen peroxide-based deodorizer and disinfectant that actually breaks down the bacteria — not just covers the smell. For turf that's seen heavy use, we replenish the infill with a pet-specific product designed to resist odor buildup going forward.",
    ],
    faq: [
      {
        q: "Will the smell really go away, or will it come back?",
        a: "Our deep-clean process targets the bacteria in the infill layer, not just the surface, so the odor doesn't just return in a few days like it can with a basic hose-down. For homes with multiple dogs or heavy use, we recommend a recurring plan to keep it from building back up.",
      },
      {
        q: "How long does a pet odor treatment take?",
        a: "Most residential jobs take 45 minutes to 2 hours, depending on the size of your yard and how built-up the odor is.",
      },
      {
        q: "Is the treatment safe for my pets and kids?",
        a: "Yes. We use pet- and kid-safe products, and can let you know the recommended wait time before they're back on the turf after treatment.",
      },
      {
        q: "How often should I get pet odor treatments?",
        a: "It depends on how many pets you have and how they use the space. Many of our recurring customers do quarterly visits; homes with multiple dogs often do monthly or bi-monthly.",
      },
      {
        q: "Do you use bleach or harsh chemicals?",
        a: "No — our disinfecting and deodorizing products are formulated specifically for artificial turf and pet safety.",
      },
    ],
  },
};
