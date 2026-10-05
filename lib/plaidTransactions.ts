import "server-only";

import { getPlaidClient } from "@/lib/plaid";
import type {
  RemovedTransaction,
  Transaction,
} from "plaid";

// Thin wrapper over Plaid's /transactions/sync -- the modern
// cursor-based endpoint (not the older /transactions/get). Paginates on
// has_more/next_cursor itself so callers (app/api/plaid/sync/route.ts)
// get one flat result for the whole sync instead of having to manage
// pages.
export type TransactionSyncResult = {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  nextCursor: string;
};

export async function syncTransactions(
  accessToken: string,
  cursor: string | null
): Promise<TransactionSyncResult> {
  const client = getPlaidClient();

  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];

  let currentCursor = cursor ?? undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor,
    });

    added.push(...response.data.added);
    modified.push(...response.data.modified);
    removed.push(...response.data.removed);

    hasMore = response.data.has_more;
    currentCursor = response.data.next_cursor;
  }

  return {
    added,
    modified,
    removed,
    nextCursor: currentCursor ?? "",
  };
}
