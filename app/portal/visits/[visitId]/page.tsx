export const dynamic = "force-dynamic";
export const revalidate = 0;

// One completed visit and its photos. A visit that is not this customer's
// (or not finished) is a plain 404, so ids can't be guessed across accounts.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PhotoGrid from "@/app/components/PhotoGrid";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { getPortalVisit } from "@/lib/portalVisits";
import { formatPastVisitDate } from "@/lib/portalLogic";
import { PortalShell } from "../../PortalShell";

export default async function PortalVisitPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { visitId } = await params;
  const visit = await getPortalVisit(customer.jobberClientId, decodeURIComponent(visitId));

  if (!visit) notFound();

  return (
    <PortalShell activeHref="/portal/visits" customerName={customer.name}>
      <Link href="/portal/visits" className="text-sm font-semibold text-[#9c7a20] hover:underline">
        &larr; All visits
      </Link>

      <section className="mt-3 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">{formatPastVisitDate(visit.startAt)}</h2>
        <p className="mt-1 text-sm text-[#6b705c]">{visit.title || "Service visit"}</p>

        <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-[#9c7a20]">Photos</h3>
        {visit.photoUrls.length > 0 ? (
          <div className="mt-3">
            <PhotoGrid photos={visit.photoUrls.map((url) => ({ url }))} />
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
            No photos were taken on this visit.
          </p>
        )}
      </section>
    </PortalShell>
  );
}
