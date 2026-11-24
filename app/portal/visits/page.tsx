export const dynamic = "force-dynamic";
export const revalidate = 0;

// Past visits, newest first, with a photo count on each.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { listPortalVisits } from "@/lib/portalVisits";
import { formatPastVisitDate } from "@/lib/portalLogic";
import { PortalShell } from "../PortalShell";

export default async function PortalVisitsPage() {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const visits = await listPortalVisits(customer.jobberClientId);

  return (
    <PortalShell activeHref="/portal/visits" customerName={customer.name}>
      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Your visits</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          Every visit we&apos;ve completed at your home, with photos when our crew took them.
        </p>

        {visits.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            No completed visits yet.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {visits.map((visit) => (
              <Link
                key={visit.visitId}
                href={`/portal/visits/${encodeURIComponent(visit.visitId)}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[#e7e2d5] p-4 transition hover:border-[#d4af37]"
              >
                <div>
                  <p className="font-bold">{formatPastVisitDate(visit.startAt)}</p>
                  <p className="mt-1 text-sm text-[#6b705c]">{visit.title || "Service visit"}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-[#9c7a20]">
                  {visit.photoUrls.length > 0
                    ? `${visit.photoUrls.length} photo${visit.photoUrls.length === 1 ? "" : "s"}`
                    : "No photos"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PortalShell>
  );
}
