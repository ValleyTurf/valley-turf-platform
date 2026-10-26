// Called when a user taps "Turn off" in app/(platform)/account/
// NotificationsSection.tsx, or when that same component cleans up after
// itself before unsubscribing the browser's own PushManager.
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

  const endpoint = (body as { endpoint?: string })?.endpoint;

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    console.error("Failed to remove push subscription:", error.message);
    return NextResponse.json({ error: "Failed to remove." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
