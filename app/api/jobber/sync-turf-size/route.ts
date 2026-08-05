// One-time (but safely rerunnable) import: Jobber's live schema
// (checked via the now-deleted property-labor-schema-check diagnostic
// route) confirmed every client's primary service property exposes a
// "Turf Size" custom field, and in every real sample it was a
// CustomFieldDropdown whose valueDropdown strings ("<300", "750-1000",
// etc.) are an EXACT match for this app's own turf_size_range preset
// options (see TurfSizeField.tsx's RANGE_OPTIONS) — Jobber and this
// app happen to already use the same range buckets. Also handles the
// Numeric/Text custom-field shapes defensively in case some
// properties were set up differently, even though every sample seen
// so far was a dropdown.
//
// Per the same "don't clobber a manual entry" reasoning as the gate
// code import (app/api/import/gate-codes/route.ts): only fills
// turf_size_range/turf_size_sqft when BOTH are currently blank. If
// staff already entered a size by hand, this leaves it alone.
import { NextResponse } from "next/server";
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
export const maxDuration = 120;

const SYNC_TYPE = "turf_size";
const TURF_SIZE_LABEL = "turf size";

const CLIENT_BATCH_SIZE = 50;
const PAGE_DELAY_MS = 500;
const THROTTLE_RETRY_DELAY_MS = 3000;
const MAX_THROTTLE_RETRIES = 5;

// Same preset list as TurfSizeField.tsx's RANGE_OPTIONS — kept as a
// literal copy rather than a shared import since one lives in a
// client component (bundled to the browser) and this is a
// server-only route; duplicating a short constant list is simpler and
// safer than restructuring that boundary just for this.
const KNOWN_RANGE_OPTIONS = new Set([
  "<300",
  "300-500",
  "500-750",
  "750-1000",
  "1000-1250",
  "1250-1500",
  "1500-1750",
  "1750-2000",
  "2000-2250",
  "2250-2500",
  "2500-2750",
  "2750-3000",
  ">3000",
]);

const TURF_SIZE_QUERY = `
  query GetTurfSizePage($limit: Int!, $cursor: String) {
    clients(first: $limit, after: $cursor) {
      nodes {
        id
        clientProperties(first: 1) {
          nodes {
            customFields {
              ... on CustomFieldDropdown {
                label
                valueDropdown
              }
              ... on CustomFieldNumeric {
                label
                valueNumeric
              }
              ... on CustomFieldText {
                label
                valueText
              }
            }
          }
        }
      }

      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

type CustomFieldNode = {
  label: string | null;
  valueDropdown?: string | null;
  valueNumeric?: number | null;
  valueText?: string | null;
};

type JobberClientNode = {
  id: string;
  clientProperties: { nodes: { customFields: CustomFieldNode[] }[] };
};

type TurfSizePage = {
  clients: {
    nodes: JobberClientNode[];
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
};

type JobberGraphQLResponse<T> = {
  data: T | null;
  errors: Array<{ message: string; extensions?: { code?: string } }> | null;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function findTurfSizeField(client: JobberClientNode): CustomFieldNode | null {
  const property = client.clientProperties?.nodes?.[0];
  if (!property) return null;

  return (
    property.customFields.find((field) => (field.label ?? "").trim().toLowerCase() === TURF_SIZE_LABEL) ?? null
  );
}

// Returns which column to write and what value, or null if the field
// wasn't usable (blank dropdown, a range string that doesn't match our
// known presets, etc.) — better to skip than write something the
// TurfSizeField dropdown can't display.
function resolveTurfSizeValue(
  field: CustomFieldNode
): { range: string | null; sqft: number | null } | null {
  if (typeof field.valueDropdown === "string" && field.valueDropdown.trim()) {
    const value = field.valueDropdown.trim();
    if (KNOWN_RANGE_OPTIONS.has(value)) {
      return { range: value, sqft: null };
    }
    return null;
  }

  if (typeof field.valueNumeric === "number" && Number.isFinite(field.valueNumeric)) {
    return { range: null, sqft: field.valueNumeric };
  }

  if (typeof field.valueText === "string" && field.valueText.trim()) {
    const text = field.valueText.trim();
    if (KNOWN_RANGE_OPTIONS.has(text)) {
      return { range: text, sqft: null };
    }
    const asNumber = Number(text.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return { range: null, sqft: asNumber };
    }
  }

  return null;
}

async function getTurfSizePage(
  cursor: string | null,
  pageNumber: number
): Promise<{ response: JobberGraphQLResponse<TurfSizePage>; throttleRetries: number }> {
  return fetchPageWithThrottleRetry<TurfSizePage>(
    () => jobberGraphQL<TurfSizePage>(TURF_SIZE_QUERY, { limit: CLIENT_BATCH_SIZE, cursor }),
    { pageNumber, maxRetries: MAX_THROTTLE_RETRIES, retryDelayMs: THROTTLE_RETRY_DELAY_MS, label: "turf size page" }
  );
}

async function syncTurfSize() {
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageNumber = 0;

  let clientsReceived = 0;
  let turfSizeFieldsFound = 0;
  let customersUpdated = 0;
  let throttleRetries = 0;
  const warnings: string[] = [];

  while (hasNextPage) {
    pageNumber += 1;

    if (pageNumber > 200) {
      warnings.push("Stopped after 200 pages for safety.");
      break;
    }

    const pageResult = await getTurfSizePage(cursor, pageNumber);
    const jobberResponse = pageResult.response;
    throttleRetries += pageResult.throttleRetries;

    if (jobberResponse.errors?.length) {
      const message = jobberResponse.errors.map((e) => e.message).filter(Boolean).join(", ");
      throw new Error(message || `Jobber failed on turf size page ${pageNumber}.`);
    }

    const clients = jobberResponse.data?.clients?.nodes ?? [];
    const pageInfo = jobberResponse.data?.clients?.pageInfo;
    clientsReceived += clients.length;

    for (const client of clients) {
      const turfField = findTurfSizeField(client);
      if (!turfField) continue;

      const resolved = resolveTurfSizeValue(turfField);
      if (!resolved) continue;

      turfSizeFieldsFound += 1;

      // Only fill in when BOTH are currently blank — never overwrite a
      // manually entered size. .select() after .update() makes
      // Supabase return the rows that were actually changed, so we can
      // tell a real update apart from "matched nothing" (already had a
      // manual value, so the .or()/.is() filters excluded it).
      const { data, error } = await supabaseServer
        .from("customers")
        .update({
          turf_size_range: resolved.range,
          turf_size_sqft: resolved.sqft,
        })
        .eq("jobber_client_id", client.id)
        .or("turf_size_range.is.null,turf_size_range.eq.")
        .is("turf_size_sqft", null)
        .select("jobber_client_id");

      if (error) {
        warnings.push(`Could not update turf size for ${client.id}: ${error.message}`);
        continue;
      }

      if (data && data.length > 0) {
        customersUpdated += data.length;
      }
    }

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    if (hasNextPage && !cursor) {
      warnings.push(`Jobber reported another page after page ${pageNumber}, but no cursor was returned.`);
      break;
    }

    if (hasNextPage) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return {
    clientsReceived,
    turfSizeFieldsFound,
    customersUpdated,
    pagesProcessed: pageNumber,
    throttleRetries,
    warnings,
  };
}

export async function GET() {
  let syncRunId: string | null = null;

  try {
    const alreadyRunning = await checkNotAlreadyRunning(SYNC_TYPE);

    if (alreadyRunning) {
      return NextResponse.json(
        {
          success: false,
          alreadyRunning: true,
          message: "A turf size sync is already running.",
          lastStartedAt: alreadyRunning.lastStartedAt,
        },
        { status: 409 }
      );
    }

    syncRunId = await startSyncRun(SYNC_TYPE);

    const syncResult = await syncTurfSize();

    await completeSyncRun(SYNC_TYPE, syncRunId, {
      recordsReceived: syncResult.clientsReceived,
      recordsSaved: syncResult.customersUpdated,
      pagesProcessed: syncResult.pagesProcessed,
      throttleRetries: syncResult.throttleRetries,
      metadata: { warnings: syncResult.warnings, turfSizeFieldsFound: syncResult.turfSizeFieldsFound },
    });

    return NextResponse.json({
      success: true,
      message: `Filled in turf size for ${syncResult.customersUpdated} customers.`,
      ...syncResult,
    });
  } catch (error) {
    console.error("Turf size sync failed:", error);

    const errorMessage = error instanceof Error ? error.message : "An unknown turf size sync error occurred.";

    if (syncRunId) {
      await failSyncRun(SYNC_TYPE, syncRunId, errorMessage);
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
