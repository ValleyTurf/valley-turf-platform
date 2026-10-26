"use client";

import { useEffect, useState } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type Status =
  | "checking"
  | "unsupported"
  | "needs-install"
  | "denied"
  | "off"
  | "on"
  | "busy";

// Safari/iOS only exposes PushManager to a web app that's actually been
// added to the home screen and opened from there -- same
// isRunningStandalone() check app/components/InstallPrompt.tsx uses.
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
}

// PushManager wants the VAPID public key as a raw Uint8Array backed by a
// concrete ArrayBuffer (not the base64url string lib/webPush.ts
// generates it as) -- explicitly allocating the ArrayBuffer first, rather
// than letting `new Uint8Array(length)` infer one, keeps this typed as
// Uint8Array<ArrayBuffer> rather than the wider Uint8Array<ArrayBufferLike>
// that subscribe()'s BufferSource param rejects.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);

  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }

  return output;
}

// Per-device opt-in for the home-screen badge (Ryan + Brittanie,
// 2026-10-25). Lives on Account rather than a global Settings page --
// unlike referral sources, this is tied to the specific phone/browser
// it's enabled from, not a business-wide setting.
export default function NotificationsSection() {
  const [status, setStatus] = useState<Status>("checking");

  // Every branch below only ever sets state from inside a .then()
  // callback, never synchronously in the effect body itself (even the
  // "unsupported"/"needs-install"/"denied" checks, which don't actually
  // need to wait on anything) -- same react-hooks rule
  // app/components/InstallPrompt.tsx works around by only calling
  // setState from inside its event listener callbacks, never directly
  // in the effect.
  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then((): Status | Promise<Status> => {
        if (
          !PUBLIC_KEY ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        ) {
          return "unsupported";
        }

        if (!isStandalone()) {
          return "needs-install";
        }

        if (Notification.permission === "denied") {
          return "denied";
        }

        return navigator.serviceWorker.ready
          .then((registration) => registration.pushManager.getSubscription())
          .then((subscription): Status => (subscription ? "on" : "off"))
          .catch((): Status => "off");
      })
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    if (!PUBLIC_KEY) return;

    setStatus("busy");

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setStatus(response.ok ? "on" : "off");
    } catch (error) {
      console.error("Enabling notifications failed:", error);
      setStatus("off");
    }
  }

  async function handleDisable() {
    setStatus("busy");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setStatus("off");
    } catch (error) {
      console.error("Disabling notifications failed:", error);
      setStatus("off");
    }
  }

  if (status === "checking") return null;

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow">
      <h2 className="text-lg font-bold">Notifications</h2>

      <p className="mt-1 text-sm text-[#174734]/70">
        Get a red badge on this device&apos;s home-screen icon (and a
        notification) when a new customer message comes in.
      </p>

      {status === "unsupported" && (
        <p className="mt-3 text-sm text-[#174734]/70">
          This browser doesn&apos;t support push notifications yet.
        </p>
      )}

      {status === "needs-install" && (
        <p className="mt-3 text-sm text-[#174734]/70">
          Add this app to your home screen first (Share → Add to Home
          Screen on iPhone, or the Install banner on Android), then open
          it from the home screen icon to turn this on.
        </p>
      )}

      {status === "denied" && (
        <p className="mt-3 text-sm text-[#174734]/70">
          Notifications are blocked for this app in your phone&apos;s
          Settings. Turn them back on there, then reload this page.
        </p>
      )}

      {status === "off" && (
        <button
          type="button"
          onClick={handleEnable}
          className="mt-3 rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#123a29]"
        >
          Enable on this device
        </button>
      )}

      {status === "on" && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm font-bold text-[#174734]">
            Enabled on this device
          </span>

          <button
            type="button"
            onClick={handleDisable}
            className="rounded-xl border border-[#174734]/20 px-3 py-1.5 text-sm font-bold text-[#174734] transition hover:bg-[#f5f4ef]"
          >
            Turn off
          </button>
        </div>
      )}

      {status === "busy" && (
        <p className="mt-3 text-sm text-[#174734]/70">Working…</p>
      )}
    </section>
  );
}
