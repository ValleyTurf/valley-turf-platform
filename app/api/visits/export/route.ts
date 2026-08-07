// CSV download for the Visits report — gated the same way the page
// itself is (the "financials" role_permissions section), matching
// app/api/transactions/export/route.ts's reasoning: this is a togglable
// section, not a hardcoded role check, so the route re-checks the same
// toggle directly.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, isPathAllowedForRole } from "@/lib/permissions";
import { rowsToCsv } from "@/lib/csv";
import { formatPhoenixTime } from "@/lib/visitReportFormatting";
import type { VisitSortField } from "@/lib/visitReportFormatting";
import { getVisitReport } from "@/lib/visitReport";

function isSortField(value: string | null): value is VisitSortField {
  return ["date", "client", "jobNumber", "jobType", "status"].includes(value ?? "");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const permissions = await getRolePermissions();

  if (!isPathAllowedForRole("/visits", user.role, permissions)) {
    return NextResponse.json(
      { error: "You don't have access to Visits." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);

  // Same reasoning as the Transactions export route: the page always
  // resolves its timeframe down to concrete start/end dates before
  // building this export link, so this route only trusts those.
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "Missing start/end date." },
      { status: 400 }
    );
  }

  const jobType = searchParams.get("jobType") || "all";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("q") || "";
  const sortParam = searchParams.get("sort");
  const sortField: VisitSortField = isSortField(sortParam) ? sortParam : "date";
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const { rows } = await getVisitReport({
    startDate,
    endDate,
    jobType,
    status,
    search,
    sortField,
    sortDir,
  });

  const csv = rowsToCsv(
    rows.map((row) => ({
      job_number: row.jobNumber ?? "",
      date: row.date ?? "",
      start_time: formatPhoenixTime(row.startAt) ?? "",
      end_time: formatPhoenixTime(row.endAt) ?? "",
      visit_title: row.title ?? "",
      client: row.clientName,
      client_email: row.clientEmail ?? "",
      client_phone: row.clientPhone ?? "",
      status: row.status,
      job_type: row.jobType,
    }))
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="visits-${startDate}-to-${endDate}.csv"`,
    },
  });
}
