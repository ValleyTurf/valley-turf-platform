// One-time diagnostic (2026-09-20). Ryan: Tina Aghassi's customer page
// is showing a note/photos under a Nov 19, 2026 visit that he actually
// entered (about a completed Sep 6 visit) back on Sep 6. This is the
// exact failure mode AddVisitNoteForm.tsx's own header comment already
// documents and has since been fixed for NEW notes going forward: before
// that fix, a successful save called form.reset(), which snapped the
// visit <select> back to its defaultValue (noteableVisits[0] -- the
// customer's next UPCOMING visit, listed ahead of past ones). A staff
// member who added a text note about a past visit, then came right back
// to attach photos to that same note, had the picker silently jump to a
// different (often future) visit in between -- landing the photos on
// the wrong visit's jobber_visit_id with no indication it happened.
//
// lib/visitNotes.ts's updateVisitNote/deleteVisitNote were added for
// exactly this kind of after-the-fact correction, but jobber_visit_id
// itself isn't editable through either -- this diagnostic exists to (1)
// pin down Tina's specific note(s)/visit and (2) sweep every customer's
// visit_notes for the same signature, since the underlying bug predates
// today's fix and could have hit anyone, not just Tina.
//
// The signature: a visit_note's created_at is well BEFORE the start_at
// of the visit it's attached to. That's backwards for how this feature
// is actually used -- staff document a visit (condition, issues,
// before/after photos) once it's happened or is happening, not days or
// months ahead of a visit that hasn't occurred yet. A 7-day threshold
// keeps this from flagging a same-week note logged a few days ahead of a
// near-term visit.
//
// Read-only, admin-gated, manual-trigger only. No writes.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const SUSPICIOUS_DAYS_AHEAD = 7;

type VisitNoteRow = {
  id: string;
  jobber_visit_id: string;
  jobber_client_id: string;
  note: string | null;
  photo_paths: string[] | null;
  created_at: string;
};

type VisitRow = {
  jobber_visit_id: string;
  jobber_client_id: string;
  customer_name: string | null;
  title: string | null;
  start_at: string | null;
};

async function fetchAll<T>(
  table: string,
  columns: string,
  orderColumn: string
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`fetchAll(${table}) failed:`, error.message);
      break;
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function daysBetween(earlierIso: string, laterIso: string): number {
  return (
    (new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 86400000
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const nameQuery = request.nextUrl.searchParams.get("name") ?? "Aghassi";

  const [allNotes, allVisits, matchingCustomers] = await Promise.all([
    fetchAll<VisitNoteRow>(
      "visit_notes",
      "id, jobber_visit_id, jobber_client_id, note, photo_paths, created_at",
      "id"
    ),
    fetchAll<VisitRow>(
      "jobber_visits",
      "jobber_visit_id, jobber_client_id, customer_name, title, start_at",
      "jobber_visit_id"
    ),
    supabaseServer
      .from("customers")
      .select("jobber_client_id, first_name, last_name")
      .or(`first_name.ilike.%${nameQuery}%,last_name.ilike.%${nameQuery}%`),
  ]);

  const visitById = new Map<string, VisitRow>(
    allVisits.map((v) => [v.jobber_visit_id, v])
  );

  const visitsByClient = new Map<string, VisitRow[]>();
  for (const v of allVisits) {
    const list = visitsByClient.get(v.jobber_client_id) ?? [];
    list.push(v);
    visitsByClient.set(v.jobber_client_id, list);
  }

  function candidateVisitsFor(clientId: string, createdAt: string, currentVisitId: string) {
    const visits = visitsByClient.get(clientId) ?? [];
    return visits
      .filter((v) => v.start_at && v.jobber_visit_id !== currentVisitId)
      .map((v) => ({
        jobber_visit_id: v.jobber_visit_id,
        title: v.title,
        start_at: v.start_at,
        abs_days_from_note: Math.abs(daysBetween(createdAt, v.start_at as string)),
      }))
      .sort((a, b) => a.abs_days_from_note - b.abs_days_from_note)
      .slice(0, 3);
  }

  // Full sweep across every customer.
  const flagged: Array<Record<string, unknown>> = [];
  for (const note of allNotes) {
    const visit = visitById.get(note.jobber_visit_id);
    if (!visit || !visit.start_at) continue;

    const daysAhead = daysBetween(note.created_at, visit.start_at);
    if (daysAhead > SUSPICIOUS_DAYS_AHEAD) {
      flagged.push({
        noteId: note.id,
        jobberClientId: note.jobber_client_id,
        customerName: visit.customer_name,
        noteText: note.note,
        photoCount: (note.photo_paths ?? []).length,
        noteCreatedAt: note.created_at,
        currentlyAttachedVisit: {
          jobber_visit_id: visit.jobber_visit_id,
          title: visit.title,
          start_at: visit.start_at,
        },
        daysNoteIsAheadOfVisit: Math.round(daysAhead * 10) / 10,
        candidateCorrectVisits: candidateVisitsFor(
          note.jobber_client_id,
          note.created_at,
          note.jobber_visit_id
        ),
      });
    }
  }

  // Targeted detail for the named customer (defaults to Tina Aghassi),
  // independent of the threshold above, so every one of her notes and
  // visits is visible for a manual read even if something doesn't cross
  // the 7-day bar.
  const customers = (matchingCustomers.data ?? []) as {
    jobber_client_id: string;
    first_name: string | null;
    last_name: string | null;
  }[];

  const namedCustomerDetail = customers.map((customer) => {
    const clientId = customer.jobber_client_id;
    const notes = allNotes
      .filter((n) => n.jobber_client_id === clientId)
      .map((n) => {
        const visit = visitById.get(n.jobber_visit_id);
        return {
          noteId: n.id,
          noteText: n.note,
          photoCount: (n.photo_paths ?? []).length,
          noteCreatedAt: n.created_at,
          attachedVisit: visit
            ? { jobber_visit_id: visit.jobber_visit_id, title: visit.title, start_at: visit.start_at }
            : { jobber_visit_id: n.jobber_visit_id, title: null, start_at: null },
        };
      })
      .sort((a, b) => a.noteCreatedAt.localeCompare(b.noteCreatedAt));

    const visits = (visitsByClient.get(clientId) ?? [])
      .slice()
      .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));

    return {
      jobberClientId: clientId,
      name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim(),
      notes,
      allVisits: visits,
    };
  });

  return NextResponse.json({
    success: true,
    suspiciousDaysAheadThreshold: SUSPICIOUS_DAYS_AHEAD,
    totalNotesScanned: allNotes.length,
    totalFlaggedAcrossAllCustomers: flagged.length,
    flagged,
    namedCustomerQuery: nameQuery,
    namedCustomerDetail,
  });
}
