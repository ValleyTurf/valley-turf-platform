// CSV download for the Transactions page — gated the same way the page
// itself is (the "financials" role_permissions section), not a hardcoded
// requireManager()/requireAdmin() check like the timecards/backup export
// routes. Unlike Crew Status/Timecards (MANAGER_PLUS_PREFIXES, structurally
// staff-excluded) or backups (admin-only), Financials is a togglable
// section — an admin can grant it to a specific staff member via
// Settings > Permissions, so this route re-checks that same toggle
// directly rather than assuming a role tier.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, isPathAllowedForRole } from "@/lib/permissions";
import { rowsToCsv } from "@/lib/csv";
import type { TransactionSortField } from "@/lib/transactionFormatting";
import { getTransactions } from "@/lib/transactions";

function isSortField(value: string | null): value is TransactionSortField {
  return ["date", "client", "amount", "tip", "fee"].includes(value ?? "");
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const permissions = await getRolePermissions();

  if (!isPathAllowedForRole("/transactions", user.role, permissions)) {
    return NextResponse.json(
      { error: "You don't have access to Transactions." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);

  // The Transactions page always resolves its timeframe preset (or
  // custom range) down to concrete start/end dates before building this
  // export link — see exportParams in app/(platform)/transactions/page.tsx
  // — so this route only ever needs to trust those, not re-derive them
  // from a preset name. Re-deriving here would risk the exact
  // Phoenix-vs-UTC "today" mismatch already fixed in sync-invoices.ts's
  // cleanDate() bug: a preset recomputed with a bare `new Date()` can
  // land on a different calendar day than what the page displayed.
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "Missing start/end date." },
      { status: 400 }
    );
  }

  const type = searchParams.get("type") || "all";
  const method = searchParams.get("method") || "all";
  const search = searchParams.get("q") || "";
  const sortParam = searchParams.get("sort");
  const sortField: TransactionSortField = isSortField(sortParam) ? sortParam : "date";
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";

  const { rows } = await getTransactions({
    startDate,
    endDate,
    type,
    method,
    search,
    sortField,
    sortDir,
  });

  const csv = rowsToCsv(
    rows.map((row) => ({
      client: row.clientName,
      date: row.date ?? "",
      type: row.type,
      paid_with: row.method,
      invoice_number: row.invoiceNumber ?? "",
      total: row.amount.toFixed(2),
      tip: row.tip.toFixed(2),
      fee: row.fee.toFixed(2),
    }))
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${startDate}-to-${endDate}.csv"`,
    },
  });
}
