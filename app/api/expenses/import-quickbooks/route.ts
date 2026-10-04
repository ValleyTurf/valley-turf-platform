// Ryan (2026-10-04): one-time historical import of QuickBooks expense
// data (Jan-Sep 2026) ahead of the native bank feed taking over from
// 10/1/2026 forward -- "I think we can do an import and then use the
// bank feed starting 10/1 maybe?"
//
// Parses a QuickBooks Online "Transaction Detail by Account" CSV export
// (see lib/quickbooksImport.ts for the full reasoning behind which
// sections get imported and how they map to our category list) and
// writes rows into the `expenses` table.
//
// POST multipart/form-data with a `file` field -- dry run by default,
// returns a JSON summary (counts/totals by category, which sections were
// skipped and why, any rows flagged needs_review) with nothing written.
// POST the same file again with ?apply=true to actually insert. Re-running
// apply on the same file is safe -- rows already imported (matched on
// date + amount + category + vendor, tagged via the `notes` field) are
// skipped rather than duplicated.
//
// Admin-gated, manual-trigger only, same dry-run-first pattern as every
// other action route built this session.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import {
  parseQuickBooksTransactionDetail,
  type ParsedExpenseRow,
} from "@/lib/quickbooksImport";
import { expenseCategoryLabel } from "@/app/(platform)/expenses/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMPORT_NOTE_TAG = "Imported from QuickBooks (Transaction Detail by Account)";

function dedupeKey(row: {
  expense_date: string;
  amount: number;
  category: string;
  vendor: string | null;
}): string {
  return [row.expense_date, row.amount.toFixed(2), row.category, row.vendor ?? ""].join(
    "|"
  );
}

function summarizeByCategory(rows: ParsedExpenseRow[]) {
  const byCategory = new Map<string, { count: number; total: number }>();
  for (const row of rows) {
    const existing = byCategory.get(row.category) ?? { count: 0, total: 0 };
    existing.count += 1;
    existing.total += row.amount;
    byCategory.set(row.category, existing);
  }
  return Array.from(byCategory.entries())
    .map(([category, stats]) => ({
      category,
      label: expenseCategoryLabel(category),
      count: stats.count,
      total: Math.round(stats.total * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function POST(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded -- attach the QuickBooks CSV export as 'file'." },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  const parsed = parseQuickBooksTransactionDetail(csvText);

  const needsReviewRows = parsed.rows.filter((r) => r.needsReview);
  const totalAmount =
    Math.round(parsed.rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;

  const summary = {
    fileName: file.name,
    totalRowsParsed: parsed.rows.length,
    totalAmount,
    byCategory: summarizeByCategory(parsed.rows),
    needsReviewCount: needsReviewRows.length,
    needsReviewSample: needsReviewRows.slice(0, 15).map((r) => ({
      vendor: r.vendor,
      amount: r.amount,
      expenseDate: r.expenseDate,
      category: r.category,
      sourceSection: r.sourceSection,
    })),
    skippedSections: parsed.skippedSections,
    unrecognizedSections: parsed.unrecognizedSections,
    parseWarnings: parsed.parseWarnings,
  };

  if (!apply) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      summary,
    });
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json({
      success: false,
      error: "Nothing to import -- the parsed file produced zero expense rows.",
      summary,
    });
  }

  // Idempotency check: look up anything already imported from a prior
  // run of this same route so re-applying the same file doesn't double
  // every expense.
  const { data: existingImported, error: existingError } = await supabaseServer
    .from("expenses")
    .select("expense_date, amount, category, vendor")
    .ilike("notes", `%${IMPORT_NOTE_TAG}%`);

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message, step: "dedupe-lookup" },
      { status: 500 }
    );
  }

  const existingKeys = new Set(
    (existingImported ?? []).map((row) =>
      dedupeKey({
        expense_date: row.expense_date,
        amount: Number(row.amount),
        category: row.category,
        vendor: row.vendor,
      })
    )
  );

  const toInsert: Record<string, unknown>[] = [];
  let skippedAsDuplicate = 0;

  for (const row of parsed.rows) {
    const dbRow = {
      vendor: row.vendor || null,
      description: row.description || null,
      category: row.category,
      amount: row.amount,
      expense_date: row.expenseDate,
      source: "manual" as const,
      status: row.needsReview ? ("needs_review" as const) : ("categorized" as const),
      notes: `${IMPORT_NOTE_TAG}. Original QuickBooks category: "${row.sourceSection}". Paid via: ${row.sourceSplit || "unknown"}.`,
      created_by_user_id: actor?.id ?? null,
      created_by_name: actor?.name ?? null,
    };

    if (existingKeys.has(dedupeKey(dbRow))) {
      skippedAsDuplicate += 1;
      continue;
    }

    toInsert.push(dbRow);
  }

  const insertedIds: string[] = [];
  const insertErrors: string[] = [];
  const BATCH_SIZE = 200;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabaseServer
      .from("expenses")
      .insert(batch)
      .select("id");

    if (error) {
      insertErrors.push(`Batch starting at row ${i}: ${error.message}`);
      continue;
    }

    for (const row of data ?? []) {
      insertedIds.push(row.id);
    }
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "expense_import",
    entityId: `qb-import-${new Date().toISOString().slice(0, 10)}`,
    entityLabel: `QuickBooks historical import (${file.name})`,
    after: {
      rowsImported: insertedIds.length,
      rowsSkippedAsDuplicate: skippedAsDuplicate,
      totalAmount,
      byCategory: summary.byCategory,
    },
    note:
      insertErrors.length > 0
        ? `Completed with ${insertErrors.length} batch error(s): ${insertErrors.join("; ")}`
        : undefined,
  });

  return NextResponse.json({
    success: insertErrors.length === 0,
    applied: true,
    rowsImported: insertedIds.length,
    rowsSkippedAsDuplicate: skippedAsDuplicate,
    insertErrors,
    summary,
  });
}
