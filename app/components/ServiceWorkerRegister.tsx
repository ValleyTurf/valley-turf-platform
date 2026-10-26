"use client";

import { useEffect } from "react";

type Props = {
  unreadMessageCount?: number;
};

type BadgingNavigator = {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

// Registers public/sw.js once the app shell has mounted, and -- new,
// 2026-10-25 -- keeps the home-screen app badge in sync with the
// Messages inbox whenever a page in this app is actually open. This is
// the "I just read everything, clear the dot" half of the badge feature
// (Ryan + Brittanie: "would like our mobile app show on my home screen
// with a red dot like you see when there are other apps with new
// messages"); the "a new message arrived while the app was closed" half
// is public/sw.js's push handler, driven server-side by lib/webPush.ts.
//
// Deliberately a tiny, standalone client component with zero imports
// beyond React — same isolation rule as lib/permissionRules.ts and
// Sidebar.tsx: nothing that renders on every authenticated page may pull
// in lib/supabase-server.ts, directly or transitively, or its
// createClient() call ships into the browser bundle and crashes
// hydration app-wide (see that file's comment for the outage this
// already caused once). unreadMessageCount is a plain number prop from
// the server layout (which already computes it for the Sidebar's own
// badge), not a fetch from here, to keep that rule intact.
//
// Renders nothing — registration/badge failures (unsupported browser,
// sw.js blocked by an extension, etc.) are logged and otherwise
// swallowed so they can never break the page around them.
export default function ServiceWorkerRegister({ unreadMessageCount }: Props) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  }, []);

  useEffect(() => {
    if (typeof unreadMessageCount !== "number") return;

    const nav = navigator as unknown as BadgingNavigator;

    if (typeof nav.setAppBadge !== "function") return;

    const update =
      unreadMessageCount > 0
        ? nav.setAppBadge(unreadMessageCount)
        : nav.clearAppBadge?.();

    update?.catch((error: unknown) => {
      console.error("Failed to update app badge:", error);
    });
  }, [unreadMessageCount]);

  return null;
}
