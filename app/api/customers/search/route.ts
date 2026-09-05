// Backs every predictive customer search box in the app (the global
// search bar in app/(platform)/layout.tsx, the /customers list, and the
// /job-costs visit search) -- one endpoint, one ranking, so "type a
// name, see matches" behaves the same everywhere instead of three
// separate hand-rolled queries drifting apart over time.
//
// Not in proxy.ts's PUBLIC_PATHS or CRON_PATHS, so it gets the same
// staff-session gate as any other page -- this is only ever called from
// inside the authenticated app, never from a public/unauthenticated
// surface.
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type CustomerRow = {
  jobber_client_id: string | null;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
};

export type CustomerSearchResult = {
  jobberClientId: string;
  name: string;
  detail: string;
};

// Same escaping the /customers and /job-costs pages already use before
// dropping a raw search term into a PostgREST .or() filter string --
// duplicated rather than imported since those live in server page
// components and this is the one place across all three that isn't one.
function escapeSearchValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Keep this tiny -- it's a live-as-you-type dropdown, not a results
// page. Anyone who needs more than a handful of matches already has the
// full paginated search on /customers.
const RESULT_LIMIT = 8;

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();

  // Bail before hitting the DB at all for 0-1 character queries -- those
  // match too broadly to be useful and would just be wasted round trips
  // fired on every keystroke.
  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const safeQuery = escapeSearchValue(query);

  const { data, error } = await supabaseServer
    .from("customers")
    .select("jobber_client_id, full_name, company_name, email, phone, city, state")
    .not("jobber_client_id", "is", null)
    .or(
      [
        `full_name.ilike.%${safeQuery}%`,
        `first_name.ilike.%${safeQuery}%`,
        `last_name.ilike.%${safeQuery}%`,
        `company_name.ilike.%${safeQuery}%`,
        `email.ilike.%${safeQuery}%`,
        `phone.ilike.%${safeQuery}%`,
      ].join(",")
    )
    .order("full_name", { ascending: true })
    .limit(RESULT_LIMIT);

  if (error) {
    console.error("Customer search failed:", error.message);
    return NextResponse.json({ results: [] }, { status: 500 });
  }

  const results: CustomerSearchResult[] = ((data ?? []) as CustomerRow[])
    .filter((row): row is CustomerRow & { jobber_client_id: string } =>
      Boolean(row.jobber_client_id)
    )
    .map((row) => ({
      jobberClientId: row.jobber_client_id,
      name: row.full_name || row.company_name || "Unnamed Customer",
      detail:
        [row.email, row.phone].filter(Boolean).join(" · ") ||
        [row.city, row.state].filter(Boolean).join(", "),
    }));

  return NextResponse.json({ results });
}
