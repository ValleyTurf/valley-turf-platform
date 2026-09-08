import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Valley Turf Revival is a Queen Creek, AZ based artificial turf cleaning and pet odor removal company serving the greater Phoenix/East Valley area.",
  alternates: { canonical: "/about" },
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const GOLD = "#9c7a20";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
        About us
      </p>
      <h1 className="mt-2 text-4xl font-bold" style={{ color: BRAND_GREEN }}>
        Local, hands-on, and easy to reach
      </h1>
      <p className="mt-6 text-lg" style={{ color: MUTED_GRAY }}>
        Valley Turf Revival is based in Queen Creek, Arizona, and serves homeowners across the
        greater Phoenix/East Valley area. We focus on two things — keeping artificial turf clean
        and keeping it free of pet odor — instead of trying to be everything to everyone.
      </p>
      <p className="mt-4 text-lg" style={{ color: MUTED_GRAY }}>
        Artificial turf is low-maintenance, not no-maintenance. Dirt and debris build up in the
        infill over time, and pet odor gets trapped at a level a garden hose can&apos;t reach. We
        show up, do the work right, and communicate clearly along the way — from your first quote
        request to appointment reminders and an easy way to pay when the job&apos;s done.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <InfoCard title="Where we work" body="Queen Creek and the entire Phoenix/East Valley area — from Queen Creek to Buckeye, up to New River, and down to Maricopa and Casa Grande." />
        <InfoCard title="How to reach us" body="Call or text (480) 331-4596, or email valleyturfrevival@gmail.com. Most quote requests get a response within one business day." />
      </div>

      <div className="mt-14 rounded-3xl p-10 text-center" style={{ background: BRAND_GREEN }}>
        <h2 className="text-2xl font-bold text-white">See what we cover</h2>
        <p className="mt-2 text-white/80">Check if your area is one of the many we already serve.</p>
        <Link
          href="/service-areas"
          className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-base font-bold"
          style={{ color: BRAND_GREEN }}
        >
          View service areas
        </Link>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold" style={{ color: BRAND_GREEN }}>
        {title}
      </h2>
      <p className="mt-2 text-sm" style={{ color: MUTED_GRAY }}>
        {body}
      </p>
    </div>
  );
}
