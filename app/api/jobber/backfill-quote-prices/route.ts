// Ryan (2026-10-08): "I would like to have the pricing at some point in
// case someone reaches out in the future and we don't have jobber
// anymore. I want to know what we priced it at?"
//
// One-time (re-runnable, not scheduled) backfill: pages through every
// quote in Jobber via the top-level `quotes` connection (confirmed via
// live introspection -- debug-quote-schema?type=Query -- that `quotes`
// exists at the root, same shape as `invoices`, not just nested under
// one client) and upserts each one's final total
// (amounts.total -- also confirmed live via
// debug-quote-schema?type=QuoteAmounts) into
// jobber_quote_price_archive (migration 091). That table is then read
// by the Past Quotes pill (customers/[id]/page.tsx) to show a price
// for a Jobber-sourced quote that has no native price_total, so the
// price survives even if Jobber access is ever lost later.
//
// Same dry-run-by-default, admin-gated, manual-trigger shape as every
// other Jobber sync route (see sync-invoices/route.ts, the closest
// precedent), reusing lib/jobberSyncTracking.ts's shared throttle-retry
// and sync-run bookkeeping with its own sync_type ("quote_price_backfill")
// so a stuck run self-heals the same way and shows up in whatever
// already reads jobber_sync_status/jobber_sync_runs.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";
import {
  checkNotAlreadyRunning,
  completeSyncRun,
  failSyncRun,
  fetchPageWithThrottleRetry,
  startSyncRun,
} from "@/lib/jobberSyncTracking";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_TYPE = "quote_price_backfill";

const QUOTE_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 1000;
const THROTTLE_RETRY_DELAY_MS = 3000;
const MAX_THROTTLE_RETRIES = 5;
// Safety stop -- same purpose as sync-invoices' 100-page cap. At 50/page
// that's up to 10,000 quotes, comfortably past any realistic total here;
// if this business ever legitimately has more, bump both caps together.
const MAX_PAGES = 200;

type JobberQuoteAmounts = {
  total: number | string | null;
};

type JobberQuoteForBackfill = {
  id: string;
  quoteNumber: string | number | null;
  amounts: JobberQuoteAmounts | null;
};

type QuotesPage = {
  quotes: {
    nodes: JobberQuoteForBackfill[];
    pageInfo: {
      endCursor: string | null;
      hasNextPage: boolean;
    };
  };
};

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: Array<{
    message: string;
    extensions?: { code?: string };
  }> | null;
};

const QUOTES_QUERY = `
  query GetQuotesPageForPriceBackfill(
    $limit: Int!
    $cursor: String
  ) {
    quotes(
      first: $limit
      after: $cursor
    ) {
      nodes {
        id
        quoteNumber
        amounts {
          total
        }
      }

      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function cleanAmount(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

type ArchiveRow = {
  jobber_quote_id: string;
  quote_number: string | null;
  total: number;
  captured_at: string;
};

function formatQuoteForArchive(quote: JobberQuoteForBackfill): ArchiveRow {
  return {
    jobber_quote_id: quote.id,
    quote_number: quote.quoteNumber === null ? null : String(quote.quoteNumber),
    total: cleanAmount(quote.amounts?.total),
    captured_at: new Date().toISOString(),
  };
}

async function getQuotesPage(
  cursor: string | null,
  pageNumber: number
): Promise<{
  response: JobberGraphQLResponse<QuotesPage>;
  throttleRetries: number;
}> {
  return fetchPageWithThrottleRetry<QuotesPage>(
    () =>
      jobberGraphQL<QuotesPage>(QUOTES_QUERY, {
        limit: QUOTE_BATCH_SIZE,
        cursor,
      }),
    {
      pageNumber,
      maxRetries: MAX_THROTTLE_RETRIES,
      retryDelayMs: THROTTLE_RETRY_DELAY_MS,
      label: "quote price backfill page",
    }
  );
}

type BackfillResult = {
  quotesReceived: number;
  quotesSaved: number;
  pagesProcessed: number;
  throttleRetries: number;
  warnings: string[];
  sampleRows: ArchiveRow[];
};

async function backfillQuotePrices(apply: boolean): Promise<BackfillResult> {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let quotesReceived = 0;
  let quotesSaved = 0;
  let throttleRetries = 0;
  const warnings: string[] = [];
  const sampleRows: ArchiveRow[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > MAX_PAGES) {
      warnings.push(`Backfill stopped after ${MAX_PAGES} pages for safety.`);
      break;
    }

    console.log(`Backfilling Jobber quote price page ${pageNumber}...`);

    const pageResult = await getQuotesPage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(", ");

      throw new Error(message || `Jobber failed on quote page ${pageNumber}.`);
    }

    const quotes = jobberResponse.data?.quotes?.nodes ?? [];
    const pageInfo = jobberResponse.data?.quotes?.pageInfo;

    quotesReceived += quotes.length;

    if (quotes.length > 0) {
      const rows = quotes.map(formatQuoteForArchive);

      if (sampleRows.length < 5) {
        sampleRows.push(...rows.slice(0, 5 - sampleRows.length));
      }

      if (apply) {
        const { error: upsertError } = await supabaseServer
          .from("jobber_quote_price_archive")
          .upsert(rows, {
            onConflict: "jobber_quote_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          throw new Error(
            `Supabase failed on quote page ${pageNumber}: ${upsertError.message}`
          );
        }
      }

      quotesSaved += rows.length;
    }

    console.log(
      `Quote price backfill page ${pageNumber} complete. Received ${quotesReceived}, ${
        apply ? "saved" : "would save"
      } ${quotesSaved}.`
    );

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(
        `Jobber reported another quote page after page ${pageNumber}, but no cursor was returned.`
      );
      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    quotesReceived,
    quotesSaved,
    pagesProcessed: pageNumber,
    throttleRetries,
    warnings,
    sampleRows,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  let syncRunId: string | null = null;

  try {
    if (apply) {
      const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

      if (alreadyRunning) {
        return NextResponse.json(
          {
            success: false,
            alreadyRunning: true,
            message: "A quote price backfill is already running.",
            lastStartedAt: alreadyRunning.lastStartedAt,
          },
          { status: 409 }
        );
      }

      syncRunId = await startSyncRun(SYNC_TYPE);
    }

    const result = await backfillQuotePrices(apply);

    if (apply && syncRunId) {
      await completeSyncRun(SYNC_TYPE, syncRunId, {
        recordsReceived: result.quotesReceived,
        recordsSaved: result.quotesSaved,
        pagesProcessed: result.pagesProcessed,
        throttleRetries: result.throttleRetries,
        metadata: { warnings: result.warnings },
      });
    }

    return NextResponse.json({
      success: true,
      dryRun: !apply,
      message: apply
        ? "Jobber quote prices archived successfully."
        : "Dry run only -- pass ?apply=true to actually write these to jobber_quote_price_archive.",
      ...result,
    });
  } catch (error) {
    console.error("Jobber quote price backfill failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "An unknown backfill error occurred.";

    if (apply && syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
