"use client";

import { useEffect, useState } from "react";

// Not in lib.dom.d.ts yet — this is the standard shape Chrome/Edge/
// Android fire on the `beforeinstallprompt` event.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "vtr-install-prompt-dismissed-at";
const DISMISS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

function wasRecentlyDismissed(): boolean {
  try {
    const stored = window.localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;

    const dismissedAt = Number(stored);
    if (!Number.isFinite(dismissedAt)) return false;

    return Date.now() - dismissedAt < DISMISS_SNOOZE_MS;
  } catch {
    // Private-browsing/localStorage-disabled — just don't snooze.
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Nothing to do if storage isn't available — the banner will just
    // show again next visit, which is a fine fallback.
  }
}

function isRunningStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for "launched from Home Screen".
    nav.standalone === true
  );
}

// Chrome/Android won't show its own install UI unless the page calls
// preventDefault() on beforeinstallprompt and drives the prompt itself —
// this banner is that UI. iOS Safari never fires this event at all (it
// has no programmatic install prompt), so on iOS this component simply
// never renders anything, which is correct: those crews already get the
// manifest/icons via Safari's own Share -> Add to Home Screen.
export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isRunningStandalone() || wasRecentlyDismissed()) {
      setDismissed(true);
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setPromptEvent(null);
      setDismissed(true);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!promptEvent) return;

    await promptEvent.prompt();
    await promptEvent.userChoice;

    // Either way the one-time prompt is spent — Chrome won't let it be
    // reused, so there's nothing left to show regardless of the choice.
    setPromptEvent(null);
  }

  function handleDismiss() {
    rememberDismissal();
    setDismissed(true);
  }

  if (dismissed || !promptEvent) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-md items-center gap-4 rounded-2xl bg-[#174734] p-4 text-white shadow-xl">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Install Valley Turf Revival OS</p>
          <p className="mt-0.5 text-xs text-white/70">
            Add it to your home screen for one-tap access in the field.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>

        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 rounded-xl bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#174734] transition hover:bg-[#e0bd4a]"
        >
          Install
        </button>
      </div>
    </div>
  );
}
