// One-off, two-customer action (2026-09-24). Ryan: Patrick Durkin and
// Raquel Mariscal need different pricing on their Full-Monthly visits
// than their Maintenance-Monthly ones (Durkin: $300 Full / $150
// Maintenance -- "we do both sides of the yard"; Mariscal: $260 Full /
// $150 Maintenance). Both run off a single recurring native job with
// one flat price (currently $150 for both) -- see migration
// 085_add_visit_price_override.sql's header comment for why a flat
// per-job price can't represent this. This sets the new
// jobber_visits.price_override per visit instead.
//
// Keyed off each visit's MONTH against the customer's own known Full
// months, not the visit's current title text -- a few of Mariscal's
// upcoming visits haven't been retitled yet (still read "Monthly
// Maintenance Plan"), so matching by title would silently skip them.
// "Initial Full Cleaning"/one-time visits are skipped by name -- those
// aren't part of the recurring Full/Maintenance cadence this is pricing.
//
// Scoped to visits with no invoice yet (jobber_invoice_id is null) --
// covers every future visit plus any already-completed-but-unbilled one
// sitting in the Create Invoices queue right now, without touching
// historical pricing on anything already invoiced.
//
// Dry-run by default (?apply=true to write), admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Plain number[] (not `as const`) for fullMonths -- an `as const` tuple
// here types it as [1, 4, 7, 10] rather than number[], which then fails
// to compile: Array<1|4|7|10>.includes(month) doesn't accept a plain
// `number` argument, and month (from getUTCMonth() + 1) is always a
// plain number.
type PricingCustomer = {
  label: string;
  jobberClientId: string;
  fullMonths: number[];
  fullPrice: number;
  maintenancePrice: number;
};

const CUSTOMERS: PricingCustomer[] = [
  {
    label: "Durkin",
    jobberClientId: "Z2lkOi8vSm9iYmVyL0NsaWVudC8xMjA0MTc2MTU=",
    fullMonths: [1, 4, 7, 10],
    fullPrice: 300,
    maintenancePrice: 150,
  },
  {
    label: "Mariscal",
    jobberClientId: "Z2lkOi8vSm9iYmVyL0NsaWVudC8xMDYyOTgzNTY=",
    fullMonths: [1, 4, 7, 10],
    fullPrice: 260,
    maintenancePrice: 150,
  },
];

type VisitRow = {
  jobber_visit_id: string;
  title: string | null;
  start_at: string | null;
  price_override: number | string | null;
};

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true";

  const results: {
    customer: string;
    fullPrice: number;
    maintenancePrice: number;
    eligibleVisits: number;
    wouldUpdate: number;
    updated: number;
    sample: {
      jobberVisitId: string;
      title: string | null;
      startAt: string | null;
      month: number;
      previousPriceOverride: number | string | null;
      newPriceOverride: number;
    }[];
  }[] = [];
  const errors: string[] = [];

  for (const customer of CUSTOMERS) {
    const { data: visits, error: visitsError } = await supabaseServer
      .from("jobber_visits")
      .select("jobber_visit_id, title, start_at, price_override")
      .eq("jobber_client_id", customer.jobberClientId)
      .eq("source", "native")
      .is("jobber_invoice_id", null)
      .not("start_at", "is", null);

    if (visitsError) {
      errors.push(`${customer.label}: ${visitsError.message}`);
      continue;
    }

    const eligible = (visits as VisitRow[]).filter(
      (v) => !(v.title ?? "").toLowerCase().includes("initial")
    );

    const toUpdate = eligible
      .map((v) => {
        const month = new Date(v.start_at as string).getUTCMonth() + 1;
        const targetPrice = customer.fullMonths.includes(month)
          ? customer.fullPrice
          : customer.maintenancePrice;
        return { visit: v, month, targetPrice };
      })
      .filter(({ visit, targetPrice }) => Number(visit.price_override ?? NaN) !== targetPrice);

    let updated = 0;

    if (apply) {
      for (const { visit, targetPrice } of toUpdate) {
        const { error: updateError } = await supabaseServer
          .from("jobber_visits")
          .update({ price_override: targetPrice, updated_at: new Date().toISOString() })
          .eq("jobber_visit_id", visit.jobber_visit_id);

        if (updateError) {
          errors.push(`${customer.label} ${visit.jobber_visit_id}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    results.push({
      customer: customer.label,
      fullPrice: customer.fullPrice,
      maintenancePrice: customer.maintenancePrice,
      eligibleVisits: eligible.length,
      wouldUpdate: toUpdate.length,
      updated,
      sample: toUpdate.slice(0, 60).map(({ visit, month, targetPrice }) => ({
        jobberVisitId: visit.jobber_visit_id,
        title: visit.title,
        startAt: visit.start_at,
        month,
        previousPriceOverride: visit.price_override,
        newPriceOverride: targetPrice,
      })),
    });
  }

  return NextResponse.json({ success: true, apply, results, errors });
}
