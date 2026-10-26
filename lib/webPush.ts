// Web Push (RFC 8030) delivery for the home-screen app badge + a visible
// notification, so Ryan and Brittanie can see "new customer message" on
// their phone the same way a native messaging app shows a red dot --
// Ryan, 2026-10-25: "Would like our mobile app show on my home screen
// with a red dot like you see when there are other apps with new
// messages."
//
// Platform behavior differs (see public/sw.js's push handler and MDN's
// Badging API docs), and this file doesn't need to know which: it
// always shows a notification AND calls setAppBadge from the service
// worker, and lets each platform take what it supports.
//   - iOS/iPadOS 16.4+: badges an installed home-screen app, but every
//     push MUST also show a visible notification -- a push that only
//     touched the badge would be silently dropped.
//   - Android Chrome: ignores navigator.setAppBadge entirely and
//     instead auto-badges the installed app icon based on whatever
//     notifications are still in its tray.
//   - Desktop Chrome/Edge (installed PWA): honors setAppBadge directly.
//
// VAPID keys identify this app to the push services (Apple/Google/
// Mozilla's servers) without needing a full auth backend of our own.
// Generated once with `node -e "console.log(require('web-push')
// .generateVAPIDKeys())"` -- see the chat where this file was added for
// the actual values and which Vercel env vars to put them in.
// NEXT_PUBLIC_VAPID_PUBLIC_KEY is that same public key, also exposed to
// the client bundle so the browser can call pushManager.subscribe()
// with it (see app/(platform)/account/NotificationsSection.tsx).
import "server-only";
import * as webpush from "web-push";
import { supabaseServer } from "@/lib/supabase-server";

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT || "mailto:valleyturfrevival@gmail.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  badgeCount: number;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Sends to every subscribed device, for every user who's turned
// notifications on from their own Account page -- the Messages inbox
// isn't per-user, so "who gets the badge" is simply "whoever opted in",
// all seeing the same shared team-inbox count. A dead subscription (the
// push service returns 404/410 -- uninstalled, permission revoked,
// device factory-reset, etc.) is deleted right here rather than left to
// fail silently forever.
export async function sendPushToAllSubscribers(
  payload: PushPayload
): Promise<void> {
  if (!ensureVapidConfigured()) {
    // Not set up yet (VAPID env vars not added in Vercel) -- quietly
    // no-op, same "optional until configured" pattern lib/notifications.ts
    // uses for Resend/Twilio before those env vars exist.
    return;
  }

  const { data, error } = await supabaseServer
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    console.error("Failed to load push subscriptions:", error.message);
    return;
  }

  const subscriptions = (data ?? []) as SubscriptionRow[];

  if (subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)
          ?.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await supabaseServer
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
          return;
        }

        console.error("Push send failed:", sub.endpoint, err);
      }
    })
  );
}
