// One-time (but safely rerunnable) local backfill: no Jobber API calls
// at all here — every note this scans is already sitting in this app's
// own Supabase tables, either imported from Jobber
// (jobber_job_notes, see 027_add_jobber_job_notes.sql) or written
// directly in this app (visit_notes, see
// 026_add_visit_notes_and_turf_range.sql). This just looks for a gate
// code mentioned in that text and fills customers.gate_code with it.
//
// Per the user's explicit choice: only fills gate_code when it's
// currently blank — never overwrites a code someone already typed in
// manually, so re-running this after someone hand-corrects a wrong
// code (or after new notes come in) can only help, never clobber.
//
// Safe to re-run any time (e.g. after another sync-job-notes backfill
// pulls in more historical notes, or new visit_notes are added) —
// customers that already got a gate_code just get skipped again.
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { extractGateCode } from "@/lib/gateCode";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;

type NoteRow = {
  jobber_client_id: string;
  text: string | null;
  at: string | null;
};

async function fetchAllJobNotes(): Promise<NoteRow[]> {
  const rows: NoteRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from("jobber_job_notes")
      .select("jobber_client_id, message, jobber_created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed reading jobber_job_notes: ${error.message}`);

    const batch = data ?? [];
    for (const row of batch) {
      rows.push({
        jobber_client_id: row.jobber_client_id as string,
        text: row.message as string | null,
        at: row.jobber_created_at as string | null,
      });
    }

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchAllVisitNotes(): Promise<NoteRow[]> {
  const rows: NoteRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from("visit_notes")
      .select("jobber_client_id, note, created_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed reading visit_notes: ${error.message}`);

    const batch = data ?? [];
    for (const row of batch) {
      rows.push({
        jobber_client_id: row.jobber_client_id as string,
        text: row.note as string | null,
        at: row.created_at as string | null,
      });
    }

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchCustomersNeedingGateCode(): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await supabaseServer
      .from("customers")
      .select("jobber_client_id")
      .or("gate_code.is.null,gate_code.eq.")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed reading customers: ${error.message}`);

    const batch = data ?? [];
    for (const row of batch) {
      ids.add(row.jobber_client_id as string);
    }

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

export async function GET() {
  try {
    const needingGateCode = await fetchCustomersNeedingGateCode();

    if (needingGateCode.size === 0) {
      return NextResponse.json({
        success: true,
        message: "Every customer already has a gate code on file — nothing to do.",
        customersChecked: 0,
        gateCodesFound: 0,
      });
    }

    const [jobNotes, visitNotes] = await Promise.all([fetchAllJobNotes(), fetchAllVisitNotes()]);

    // Group notes by client, newest first, so if a customer's gate code
    // ever changed and multiple notes mention different codes, the most
    // recent mention wins.
    const notesByClient = new Map<string, NoteRow[]>();

    for (const note of [...jobNotes, ...visitNotes]) {
      if (!needingGateCode.has(note.jobber_client_id)) continue;

      const existing = notesByClient.get(note.jobber_client_id);
      if (existing) {
        existing.push(note);
      } else {
        notesByClient.set(note.jobber_client_id, [note]);
      }
    }

    const updates: { jobber_client_id: string; gate_code: string }[] = [];

    for (const [clientId, notes] of notesByClient) {
      notes.sort((a, b) => {
        const aTime = a.at ? new Date(a.at).getTime() : 0;
        const bTime = b.at ? new Date(b.at).getTime() : 0;
        return bTime - aTime;
      });

      for (const note of notes) {
        const code = extractGateCode(note.text);
        if (code) {
          updates.push({ jobber_client_id: clientId, gate_code: code });
          break;
        }
      }
    }

    let updated = 0;
    const warnings: string[] = [];

    for (const update of updates) {
      const { error } = await supabaseServer
        .from("customers")
        .update({ gate_code: update.gate_code })
        .eq("jobber_client_id", update.jobber_client_id)
        // Belt-and-suspenders re-check against a concurrent manual edit
        // between the read above and this write — still only fills a
        // blank, never overwrites.
        .or("gate_code.is.null,gate_code.eq.");

      if (error) {
        warnings.push(`Could not update ${update.jobber_client_id}: ${error.message}`);
        continue;
      }

      updated += 1;
    }

    return NextResponse.json({
      success: true,
      message: `Found gate codes for ${updated} of ${needingGateCode.size} customers with a blank gate code.`,
      customersChecked: needingGateCode.size,
      gateCodesFound: updated,
      warnings,
    });
  } catch (error) {
    console.error("Gate code import failed:", error);

    const errorMessage = error instanceof Error ? error.message : "An unknown gate code import error occurred.";

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
