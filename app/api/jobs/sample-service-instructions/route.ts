// One-time diagnostic (2026-09-22). Correcting a wrong assumption from
// the last two diagnostics: "Service Instructions" is not a Jobber job
// field (jobber_jobs.instructions) -- it's customers.service_instructions,
// a field this app built directly, shown on the customer page's own
// Property Profile section ("Not synced from Jobber -- managed here
// directly"). Ryan types the Full-cleaning months straight into it, e.g.
// "Full Cleaning - Mar, June, Sept, Dec" for Alyssa Baldriche. This pulls
// a real sample so the Maintenance-to-Full auto-flip (roadmap item 19)
// can be built against the actual range of formats in use, not a guess.
//
// Read-only, admin-gated, manual-trigger only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, first_name, last_name, service_instructions")
    .not("service_instructions", "is", null)
    .neq("service_instructions", "")
    .order("full_name", { ascending: true })
    .limit(60);

  if (error) {
    return NextResponse.json(
      { success: false, error: `Couldn't read customers: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = data ?? [];

  const monthWords = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];

  const results = rows.map((row) => {
    const text = (row.service_instructions ?? "").toLowerCase();
    return {
      jobberClientId: row.jobber_client_id,
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.full_name,
      serviceInstructions: row.service_instructions,
      mentionsMonth: monthWords.some((word) => text.includes(word)),
    };
  });

  return NextResponse.json({
    success: true,
    totalWithInstructions: results.length,
    likelyMonthMentions: results.filter((row) => row.mentionsMonth).length,
    results,
  });
}
