import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WebhookEvent = {
  id: string;
  topic: string;
  jobber_item_id: string | null;
  status: string;
  attempts: number;
  payload: Record<string, unknown>;
};

const EVENT_BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

function normalizeTopic(value: string): string {
  return value.trim().toUpperCase();
}

function isAuthorized(
  request: NextRequest
): boolean {
  const expectedSecret =
    process.env.JOBBER_SYNC_SECRET;

  if (!expectedSecret) {
    console.error(
      "JOBBER_SYNC_SECRET is not configured."
    );

    return false;
  }

  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return false;
  }

  const expectedAuthorization =
    `Bearer ${expectedSecret}`;

  return (
    authorization === expectedAuthorization
  );
}

async function processWebhookEvent(
  event: WebhookEvent
): Promise<void> {
  const topic = normalizeTopic(event.topic);

  console.log(
    `Processing Jobber webhook ${event.id}: ${topic}`
  );

  switch (topic) {
    case "CLIENT_CREATE":
    case "CLIENT_UPDATE":
    case "CLIENT_DESTROY":
      console.log(
        `Customer webhook queued for item ${
          event.jobber_item_id ?? "unknown"
        }`
      );

      return;

    case "JOB_CREATE":
    case "JOB_UPDATE":
    case "JOB_DESTROY":
      console.log(
        `Job webhook queued for item ${
          event.jobber_item_id ?? "unknown"
        }`
      );

      return;

    case "INVOICE_CREATE":
    case "INVOICE_UPDATE":
    case "INVOICE_DESTROY":
      console.log(
        `Invoice webhook queued for item ${
          event.jobber_item_id ?? "unknown"
        }`
      );

      return;

    default:
      throw new Error(
        `Unsupported Jobber webhook topic: ${topic}`
      );
  }
}

export async function GET(
  request: NextRequest
) {
  if (!isAuthorized(request)) {
    console.error(
      "Rejected unauthorized Jobber webhook processor request."
    );

    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized.",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const {
      data: pendingEvents,
      error: pendingEventsError,
    } = await supabaseServer
      .from("jobber_webhook_events")
      .select(
        "id, topic, jobber_item_id, status, attempts, payload"
      )
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", {
        ascending: true,
      })
      .limit(EVENT_BATCH_SIZE);

    if (pendingEventsError) {
      throw new Error(
        `Unable to load pending webhook events: ${pendingEventsError.message}`
      );
    }

    const events =
      (pendingEvents as WebhookEvent[] | null) ??
      [];

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      const nextAttempt =
        Number(event.attempts ?? 0) + 1;

      const {
        error: processingUpdateError,
      } = await supabaseServer
        .from("jobber_webhook_events")
        .update({
          status: "processing",
          attempts: nextAttempt,
          error_message: null,
        })
        .eq("id", event.id);

      if (processingUpdateError) {
        console.error(
          `Unable to mark webhook ${event.id} as processing:`,
          processingUpdateError
        );

        failed += 1;

        continue;
      }

      try {
        await processWebhookEvent(event);

        const processedAt =
          new Date().toISOString();

        const {
          error: processedUpdateError,
        } = await supabaseServer
          .from("jobber_webhook_events")
          .update({
            status: "processed",
            processed_at: processedAt,
            error_message: null,
          })
          .eq("id", event.id);

        if (processedUpdateError) {
          throw new Error(
            `Unable to mark webhook as processed: ${processedUpdateError.message}`
          );
        }

        processed += 1;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unknown webhook processing error occurred.";

        const finalStatus =
          nextAttempt >= MAX_ATTEMPTS
            ? "failed"
            : "pending";

        const {
          error: failureUpdateError,
        } = await supabaseServer
          .from("jobber_webhook_events")
          .update({
            status: finalStatus,
            error_message: errorMessage,
          })
          .eq("id", event.id);

        if (failureUpdateError) {
          console.error(
            `Unable to record failure for webhook ${event.id}:`,
            failureUpdateError
          );
        }

        console.error(
          `Jobber webhook ${event.id} failed:`,
          error
        );

        failed += 1;
      }
    }

    return NextResponse.json({
      success: true,
      eventsFound: events.length,
      processed,
      failed,
    });
  } catch (error) {
    console.error(
      "Jobber webhook processor failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unknown webhook processor error occurred.",
      },
      {
        status: 500,
      }
    );
  }
}