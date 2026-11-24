// Past visits and their photos for the customer portal. Photos come from
// the same visit notes staff see on the visit page (visit_notes), but only
// the photos are returned: staff note text can hold internal details (gate
// codes, complaints), so it is never sent to the portal. Everything is
// scoped to the signed-in customer's jobber_client_id.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { getPastVisits } from "@/lib/customerVisitData";
import { getVisitNotesForClient } from "@/lib/visitNotes";
import { isCompletedVisit } from "@/lib/portalLogic";

export type PortalVisit = {
  visitId: string;
  title: string | null;
  startAt: string | null;
  photoUrls: string[];
};

export async function listPortalVisits(jobberClientId: string): Promise<PortalVisit[]> {
  const [visits, noteGroups] = await Promise.all([
    getPastVisits(jobberClientId),
    getVisitNotesForClient(jobberClientId),
  ]);

  const photosByVisit = new Map<string, string[]>();
  for (const group of noteGroups) {
    photosByVisit.set(
      group.jobberVisitId,
      group.notes.flatMap((note) => note.photoUrls)
    );
  }

  return visits
    .filter((visit) => isCompletedVisit(visit.visit_status, visit.completed_at))
    .map((visit) => ({
      visitId: visit.jobber_visit_id,
      title: visit.title,
      startAt: visit.start_at,
      photoUrls: photosByVisit.get(visit.jobber_visit_id) ?? [],
    }));
}

// One visit, only if it really belongs to this customer.
export async function getPortalVisit(
  jobberClientId: string,
  visitId: string
): Promise<PortalVisit | null> {
  const { data } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, jobber_client_id, title, start_at, visit_status, completed_at")
    .eq("jobber_visit_id", visitId)
    .maybeSingle();

  if (!data || data.jobber_client_id !== jobberClientId) return null;
  if (!isCompletedVisit(data.visit_status as string | null, data.completed_at as string | null)) {
    return null;
  }

  const noteGroups = await getVisitNotesForClient(jobberClientId);
  const photoUrls = noteGroups
    .filter((group) => group.jobberVisitId === visitId)
    .flatMap((group) => group.notes.flatMap((note) => note.photoUrls));

  return {
    visitId,
    title: data.title as string | null,
    startAt: data.start_at as string | null,
    photoUrls,
  };
}
