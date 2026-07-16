import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type JobberWebhookPayload = {
  data?: {
    webHookEvent?: {
      topic?: string;
      appId?: string;
      accountId?: string;
      itemId?: string;
      occurredAt?: string;
    };
  };
};

function verifySignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;

  if (!clientSecret) {
    console.error(
      "JOBBER_CLIENT_SECRET is not configured; cannot verify webhook signature."
    );
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const expectedDigest = createHmac("sha256", clientSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const expectedBuffer = Buffer.from(expectedDigest);
  const providedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-jobber-hmac-sha256");

  if (!verifySignature(rawBody, signatureHeader)) {
    console.error("Rejected Jobber webhook: invalid or missing signature.");

    return NextResponse.json(
      { error: "Invalid signature." },
      { status: 401 }
    );
  }

  let payload: JobberWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as JobberWebhookPayload;
  } catch {
    console.error("Rejected Jobber webhook: body was not valid JSON.");

    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const event = payload.data?.webHookEvent;

  if (!event?.topic) {
    console.error("Rejected Jobber webhook: missing topic in payload.");

    return NextResponse.json(
      { error: "Missing webhook topic." },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer.from("jobber_webhook_events").insert({
    topic: event.topic,
    jobber_item_id: event.itemId ?? null,
    status: "pending",
    attempts: 0,
    payload,
  });

  if (error) {
    console.error("Failed to record Jobber webhook event:", error.message);

    return NextResponse.json(
      { error: "Failed to record webhook event." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
