"use client";

import { useEffect } from "react";

// Registers public/sw.js once the app shell has mounted. Deliberately a
// tiny, standalone client component with zero imports beyond React —
// same isolation rule as lib/permissionRules.ts and Sidebar.tsx: nothing
// that renders on every authenticated page may pull in
// lib/supabase-server.ts, directly or transitively, or its
// createClient() call ships into the browser bundle and crashes
// hydration app-wide (see that file's comment for the outage this
// already caused once).
//
// Renders nothing — registration failures (unsupported browser, sw.js
// blocked by an extension, etc.) are logged and otherwise swallowed so
// they can never break the page around them.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  }, []);

  return null;
}
