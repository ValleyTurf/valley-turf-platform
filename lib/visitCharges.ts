// One-time per-visit charges (Ryan, 2026-09-27): "I need to add a line
// item in October for Ludeman ... it should not be charged each
// month." Job-level line items (lib/nativeJobs.ts's
// setNativeJobLineItems, "roadmap item 18") are the wrong tool for a
// one-off add-on -- those are permanent, applied to the job's total and
// repeated on every future recurring visit. This is the opposite:
// scoped to exactly one jobber_visits row (see migration
// 086_add_visit_one_time_charges.sql), additive on top of whatever
// that visit would otherwise charge. Self-service from the Manage Job
// page (app/(platform)/jobs/[id]/edit) -- no code change needed for
// the next customer who needs one of these.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type VisitOneTimeCharge = {
  id: string;
  jobberVisitId: string;
  name: string;
  unitPrice: number;
  createdAt: string;
};

type ChargeRow = {
  id: string;
  jobber_visit_id: string;
  name: string;
  unit_price: number | string;
  created_at: string;
};

function mapRow(row: ChargeRow): VisitOneTimeCharge {
  return {
    id: row.id,
    jobberVisitId: row.jobber_visit_id,
    name: row.name,
    unitPrice: Number(row.unit_price),
    createdAt: row.created_at,
  };
}

export async function fetchVisitOneTimeCharges(
  visitId: string
): Promise<VisitOneTimeCharge[]> {
  const { data, error } = await supabaseServer
    .from("visit_one_time_charges")
    .select("id, jobber_visit_id, name, unit_price, created_at")
    .eq("jobber_visit_id", visitId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return (data as ChargeRow[]).map(mapRow);
}

// Batch fetch for callers that need charges across many visits at once
// (dashboard/page.tsx's whole-month pass, invoices/create/page.tsx's
// page of visits) -- one query instead of one per visit.
export async function fetchVisitOneTimeChargesForVisits(
  visitIds: string[]
): Promise<Map<string, VisitOneTimeCharge[]>> {
  const map = new Map<string, VisitOneTimeCharge[]>();
  if (visitIds.length === 0) return map;

  const { data, error } = await supabaseServer
    .from("visit_one_time_charges")
    .select("id, jobber_visit_id, name, unit_price, created_at")
    .in("jobber_visit_id", visitIds)
    .order("created_at", { ascending: true });

  if (error || !data) return map;

  for (const row of data as ChargeRow[]) {
    const charge = mapRow(row);
    const list = map.get(charge.jobberVisitId) ?? [];
    list.push(charge);
    map.set(charge.jobberVisitId, list);
  }

  return map;
}

export function sumOneTimeCharges(charges: VisitOneTimeCharge[]): number {
  return charges.reduce((sum, charge) => sum + charge.unitPrice, 0);
}

export async function addVisitOneTimeCharge(params: {
  visitId: string;
  name: string;
  unitPrice: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = params.name.trim();

  if (!name) {
    return { ok: false, error: "Charge name is required." };
  }

  if (!Number.isFinite(params.unitPrice) || params.unitPrice <= 0) {
    return { ok: false, error: "Charge amount must be greater than zero." };
  }

  const { error } = await supabaseServer.from("visit_one_time_charges").insert({
    jobber_visit_id: params.visitId,
    name,
    unit_price: params.unitPrice,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeVisitOneTimeCharge(
  chargeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseServer
    .from("visit_one_time_charges")
    .delete()
    .eq("id", chargeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
