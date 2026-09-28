// One-off: confirm what columns jobber_jobs actually has (this table
// predates the tracked migrations folder, so there's no CREATE TABLE to
// read) before deciding what "newest first" should sort by on
// /jobs (Ryan, 2026-09-28). Read-only, admin-gated.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("jobber_jobs")
    .select("*")
    .limit(1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    columns: data && data[0] ? Object.keys(data[0]) : [],
    sampleRow: data?.[0] ?? null,
  });
}
