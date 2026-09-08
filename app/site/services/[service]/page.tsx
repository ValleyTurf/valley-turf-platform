import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SERVICES, getService } from "../../services";

// Data-driven per-service detail page. Only two services exist in this
// codebase today (see ../../services.ts's header comment) but this stays
// a single dynamic route rather than two hardcoded page files, so adding
// a third service later is just one new entry in SERVICE_DETAILS +
// services.ts, no new route file.
const SERVICE_DETAILS: Record<
  string,
  { intro: string; benefits: string[]; process: { title: string; body: string }[] }
> = {
  "turf-cleaning": {
    intro:
      "Artificial turf still needs regular care. Dirt, dust, pollen, and everyday debris build up in the infill over time, flattening the blades and dulling the color. Our turf cleaning service rinses and restores your lawn so it looks like the day it was installed.",
    benefits: [
      "Removes dirt, dust, and debris trapped deep in the infill",
      "Restores color and blade texture flattened by foot traffic",
      "Clears drainage so water doesn't pool after rain or watering",
      "Extends the life of your turf installation",
    ],
    process: [
      { title: "Inspect", body: "We walk the yard and check drainage, seams, and infill level." },
      { title: "Clean", body: "Deep rinse and debris removal across every section of turf." },
      { title: "Groom", body: "Blades are brushed upright and infill is leveled evenly." },
    ],
  },
  "pet-odor-removal": {
    intro:
      "Regular hosing doesn't remove the bacteria that cause pet odor in artificial turf — it just spreads it around. Our pet odor removal treatment breaks down odor-causing bacteria trapped in the infill at the source, so the smell doesn't come back after the next rinse.",
    benefits: [
      "Targets the bacteria causing odor, not just the surface smell",
      "Safe for pets and kids once the treatment has dried",
      "Works on turf of any age or infill type",
      "Pairs well with a full turf cleaning for the best results",
    ],
    process: [
      { title: "Assess", body: "We identify the hot spots pets use most." },
      { title: "Treat", body: "An enzyme-based treatment breaks down odor-causing bacteria." },
      { title: "Rinse & dry", body: "A final rinse leaves the yard fresh and ready to use." },
    ],
  },
};

export function generateStaticParams() {
  return SERVICES.map((service) => ({ service: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: slug } = await params;
  const service = getService(slug);

  if (!service) return {};

  return {
    title: service.name,
    description: `${service.shortDescription} Serving Queen Creek and the greater Phoenix/East Valley area.`,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = getService(slug);
  const details = SERVICE_DETAILS[slug];

  if (!service || !details) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
        Service
      </p>
      <h1 className="mt-2 text-4xl font-bold" style={{ color: BRAND_GREEN }}>
        {service.name}
      </h1>
      <p className="mt-5 text-lg" style={{ color: MUTED_GRAY }}>
        {details.intro}
      </p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
            What you get
          </h2>
          <ul className="mt-4 space-y-3">
            {details.benefits.map((benefit) => (
              <li key={benefit} className="flex gap-2 text-sm" style={{ color: MUTED_GRAY }}>
                <span style={{ color: GOLD }}>&#10003;</span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold" style={{ color: BRAND_GREEN }}>
            How it works
          </h2>
          <ol className="mt-4 space-y-4">
            {details.process.map((step, index) => (
              <li key={step.title} className="text-sm" style={{ color: MUTED_GRAY }}>
                <span className="font-bold" style={{ color: BRAND_GREEN }}>
                  {index + 1}. {step.title}
                </span>
                <p className="mt-1">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-14 rounded-3xl p-10 text-center" style={{ background: BRAND_GREEN }}>
        <h2 className="text-2xl font-bold text-white">Get a free quote for {service.name.toLowerCase()}</h2>
        <p className="mt-2 text-white/80">Usually a response within one business day.</p>
        <Link
          href="/request-quote"
          className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-base font-bold"
          style={{ color: BRAND_GREEN }}
        >
          Get my free quote
        </Link>
      </div>
    </div>
  );
}
