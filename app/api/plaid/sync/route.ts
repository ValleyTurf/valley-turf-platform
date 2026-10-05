// Bank feed, Phase 2 of the QuickBooks replacement. Pulls new
// transactions for every connected bank account and writes them into
// the `expenses` table -- same dry-run-by-default, admin-gated,
// ?apply=true-to-write shape as
// app/api/expenses/import-quickbooks/route.ts, adapted for a paginated
// external API instead of a CSV upload.
//
// Idempotency: `plaid_transaction_id` is a real unique ID Plaid assigns
// per transaction, so re-running this (even with ?apply=true) never
// double-imports -- strictly better than the QuickBooks importer's
// date+amount+category+vendor heuristic, which this doesn't need.
//
// Dry run never persists the new cursor onto `bank_connections` -- only
// an applied run advances it. That's what makes "preview, then commit"
// safe here: calling /transactions/sync with the same stored cursor
// twice returns the same data both times, since Plaid's own
// cursor state is driven entirely by what cursor we pass it, not by
// whether we've called it before.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";
import { syncTransactions } from "@/lib/plaidTransactions";
import { mapPlaidCategory } from "@/lib/plaidCategoryMap";
import { expenseCategoryLabel } from "@/app/(platform)/expenses/constants";
import type { Transaction } from "plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The QuickBooks historical import covers everything through
// 9/30/2026 -- the bank feed picks up from here forward. Anything a
// bank/Plaid link happens to return before this date (first-link
// backfills can reach back further than this) is discarded rather than
// risking a second copy of September.
const BANK_FEED_START_DATE = "2026-10-01";

type BankConnectionRow = {
  id: string;
  plaid_access_token: string;
  cursor: string | null;
  institution_name: string | null;
};

type ExistingExpenseRow = {
  id: string;
  plaid_transaction_id: string;
  status: string;
};

function buildExpenseRow(
  bankAccountIdByPlaidId: Map<string, string>,
  transaction: Transaction
) {
  const { category, needsReview } = mapPlaidCategory(
    transaction.personal_finance_category?.primary ?? null,
    transaction.personal_finance_category?.detailed ?? null
  );

  return {
    vendor: transaction.merchant_name ?? transaction.name ?? null,
    description: transaction.name ?? null,
    category,
    // Plaid's documented sign convention: positive = money leaving the
    // account (an expense), negative = money moving in (a deposit,
    // refund, or transfer) -- only positive amounts reach this
    // function, see the filter below.
    amount: transaction.amount,
    expense_date: transaction.date,
    source: "bank_feed" as const,
    status: needsReview ? ("needs_review" as const) : ("categorized" as const),
    plaid_transaction_id: transaction.transaction_id,
    bank_account_id: bankAccountIdByPlaidId.get(transaction.account_id) ?? null,
    notes: `Bank feed (Plaid). Category: "${
      transaction.personal_finance_category?.detailed ??
      transaction.personal_finance_category?.primary ??
      "unknown"
    }".`,
  };
}

export async function POST(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  const { data: connections, error: connectionsError } = await supabaseServer
    .from("bank_connections")
    .select("id, plaid_access_token, cursor, institution_name")
    .eq("status", "active");

  if (connectionsError) {
    return NextResponse.json({ error: connectionsError.message }, { status: 500 });
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json(
      { error: "No connected bank account. Connect one first." },
      { status: 400 }
    );
  }

  const summary = {
    connections: [] as Array<{
      institutionName: string | null;
      added: number;
      skippedDeposits: number;
      skippedBeforeCutoff: number;
      modified: number;
      modifiedSkippedAlreadyReviewed: number;
      removed: number;
      removedSkippedAlreadyReviewed: number;
      byCategory: Array<{ category: string; label: string; count: number; total: number }>;
      needsReviewCount: number;
      error?: string;
    }>,
    totalInserted: 0,
    insertErrors: [] as string[],
  };

  for (const connection of connections as BankConnectionRow[]) {
    const connectionSummary = {
      institutionName: connection.institution_name,
      added: 0,
      skippedDeposits: 0,
      skippedBeforeCutoff: 0,
      modified: 0,
      modifiedSkippedAlreadyReviewed: 0,
      removed: 0,
      removedSkippedAlreadyReviewed: 0,
      byCategory: [] as Array<{ category: string; label: string; count: number; total: number }>,
      needsReviewCount: 0,
    };

    let syncResult;
    try {
      syncResult = await syncTransactions(
        connection.plaid_access_token,
        connection.cursor
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Plaid sync request failed.";

      if (apply) {
        await supabaseServer
          .from("bank_connections")
          .update({ status: "error", last_error: message })
          .eq("id", connection.id);
      }

      summary.connections.push({ ...connectionSummary, error: message });
      continue;
    }

    const { data: accounts } = await supabaseServer
      .from("bank_accounts")
      .select("id, plaid_account_id")
      .eq("bank_connection_id", connection.id);

    const bankAccountIdByPlaidId = new Map(
      (accounts ?? []).map((a) => [a.plaid_account_id as string, a.id as string])
    );

    const byCategory = new Map<string, { count: number; total: number }>();
    const rowsToInsert: ReturnType<typeof buildExpenseRow>[] = [];

    for (const transaction of syncResult.added) {
      if (transaction.amount <= 0) {
        connectionSummary.skippedDeposits += 1;
        continue;
      }

      if (transaction.date < BANK_FEED_START_DATE) {
        connectionSummary.skippedBeforeCutoff += 1;
        continue;
      }

      const row = buildExpenseRow(bankAccountIdByPlaidId, transaction);
      rowsToInsert.push(row);
      connectionSummary.added += 1;

      if (row.status === "needs_review") {
        connectionSummary.needsReviewCount += 1;
      }

      const existing = byCategory.get(row.category) ?? { count: 0, total: 0 };
      existing.count += 1;
      existing.total += row.amount;
      byCategory.set(row.category, existing);
    }

    connectionSummary.byCategory = Array.from(byCategory.entries())
      .map(([category, stats]) => ({
        category,
        label: expenseCategoryLabel(category),
        count: stats.count,
        total: Math.round(stats.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    // Modified/removed need to look up already-imported rows by
    // plaid_transaction_id -- fetched once per connection rather than
    // per transaction.
    const modifiedIds = syncResult.modified.map((t) => t.transaction_id);
    const removedIds = syncResult.removed.map((t) => t.transaction_id);
    const lookupIds = [...modifiedIds, ...removedIds];

    const existingByPlaidId = new Map<string, ExistingExpenseRow>();
    if (lookupIds.length > 0) {
      const { data: existingRows } = await supabaseServer
        .from("expenses")
        .select("id, plaid_transaction_id, status")
        .in("plaid_transaction_id", lookupIds);

      for (const row of existingRows ?? []) {
        if (row.plaid_transaction_id) {
          existingByPlaidId.set(row.plaid_transaction_id, row as ExistingExpenseRow);
        }
      }
    }

    const modifiedUpdates: Array<{ id: string; row: ReturnType<typeof buildExpenseRow> }> = [];
    for (const transaction of syncResult.modified) {
      const existing = existingByPlaidId.get(transaction.transaction_id);

      if (!existing) continue;

      if (existing.status !== "needs_review") {
        // Ryan already opened and confirmed/edited this row -- his
        // correction wins, Plaid's update is skipped rather than
        // silently overwriting it.
        connectionSummary.modifiedSkippedAlreadyReviewed += 1;
        continue;
      }

      modifiedUpdates.push({
        id: existing.id,
        row: buildExpenseRow(bankAccountIdByPlaidId, transaction),
      });
      connectionSummary.modified += 1;
    }

    const idsToDelete: string[] = [];
    for (const removedTransaction of syncResult.removed) {
      const existing = existingByPlaidId.get(removedTransaction.transaction_id);

      if (!existing) continue;

      if (existing.status !== "needs_review") {
        connectionSummary.removedSkippedAlreadyReviewed += 1;
        continue;
      }

      idsToDelete.push(existing.id);
      connectionSummary.removed += 1;
    }

    if (apply) {
      if (rowsToInsert.length > 0) {
        const BATCH_SIZE = 200;
        for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
          const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
          const { data, error } = await supabaseServer
            .from("expenses")
            .insert(batch)
            .select("id");

          if (error) {
            summary.insertErrors.push(
              `${connection.institution_name ?? "connection"} batch at row ${i}: ${error.message}`
            );
            continue;
          }

          summary.totalInserted += data?.length ?? 0;
        }
      }

      for (const update of modifiedUpdates) {
        await supabaseServer
          .from("expenses")
          .update({
            vendor: update.row.vendor,
            description: update.row.description,
            category: update.row.category,
            amount: update.row.amount,
            expense_date: update.row.expense_date,
            status: update.row.status,
            notes: update.row.notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", update.id);
      }

      if (idsToDelete.length > 0) {
        await supabaseServer.from("expenses").delete().in("id", idsToDelete);
      }

      await supabaseServer
        .from("bank_connections")
        .update({
          cursor: syncResult.nextCursor,
          last_synced_at: new Date().toISOString(),
          status: "active",
          last_error: null,
        })
        .eq("id", connection.id);
    }

    summary.connections.push(connectionSummary);
  }

  if (apply) {
    await recordAuditLog({
      actor,
      action: "create",
      entityType: "bank_feed_sync",
      entityId: `bank-feed-sync-${new Date().toISOString()}`,
      entityLabel: "Bank feed sync",
      after: {
        rowsImported: summary.totalInserted,
        connections: summary.connections,
      },
      note:
        summary.insertErrors.length > 0
          ? `Completed with ${summary.insertErrors.length} batch error(s): ${summary.insertErrors.join("; ")}`
          : undefined,
    });
  }

  return NextResponse.json({
    success: summary.insertErrors.length === 0,
    dryRun: !apply,
    applied: apply,
    summary,
  });
}
