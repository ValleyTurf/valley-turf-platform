// Called by the client once the browser grants Notification permission
// and creates a PushSubscription (see app/(platform)/account/
// NotificationsSection.tsx) -- stores it so lib/webPush.ts's
// sendPushToAllSubscribers can reach this device later, including after
// the app is fully closed.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const subscription = body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Missing endpoint or keys." },
      { status: 400 }
    );
  }

  // Keyed on endpoint (globally unique per push subscription, assigned
  // by the browser's push service) rather than (user_id, endpoint) --
  // the same device re-subscribing (e.g. after clearing permission and
  // re-granting it) gets a new endpoint anyway, and this upsert just
  // keeps whichever user most recently enabled notifications on it,
  // which is the only sensible owner of a single physical device.
  const { error } = await supabaseServer.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    console.error("Failed to save push subscription:", error.message);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
