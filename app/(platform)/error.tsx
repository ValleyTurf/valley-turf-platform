"use client";

// Error screen for every page inside the app shell (Ryan, 2026-11-15).
// Replaces Next.js's bare "This page couldn't load ... ERROR 455897394"
// screen, which is what the Bank Feed page showed for days with no way
// to tell what was wrong. The sidebar stays put (this sits inside the
// (platform) layout), there's a Try Again button, and for admins it
// looks up the real error message behind the code -- production Next.js
// never sends that to the browser, so it comes from the server-side log
// lib/pageErrors.ts keeps (via /api/ops/page-error, which refuses
// anyone who isn't an admin). Route segments with their own error.tsx
// (Revenue, Customer Intelligence) keep using theirs.
import { useEffect, useState } from "react";

type Details =
  | { state: "loading" }
  | { state: "none" }
  | { state: "found"; message: string | null; stack: string | null; path: string | null };

export default function PlatformError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  // `retry` re-fetches and re-renders (Next 16.3+); `reset` is the older
  // prop that only re-renders. Use whichever this version hands over.
  retry?: () => void;
  reset?: () => void;
}) {
  const digest = error.digest ?? null;
  const [details, setDetails] = useState<Details>(
    digest ? { state: "loading" } : { state: "none" }
  );

  useEffect(() => {
    if (!digest) return;

    let cancelled = false;

    // The server writes its log entry as the error happens; give it a
    // moment before asking for it.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ops/page-error?digest=${encodeURIComponent(digest)}`,
          { cache: "no-store" }
        );
        const data = response.ok ? await response.json() : null;

        if (cancelled) return;

        setDetails(
          data?.found
            ? {
                state: "found",
                message: data.message ?? null,
                stack: data.stack ?? null,
                path: data.path ?? null,
              }
            : { state: "none" }
        );
      } catch {
        if (!cancelled) setDetails({ state: "none" });
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [digest]);

  const tryAgain = retry ?? reset;
  // A client-side error (not redacted) carries its own real message.
  const clientMessage = !digest && error.message ? error.message : null;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <section className="rounded-3xl bg-white p-5 shadow sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            This page ran into a problem
          </h1>

          <p className="mt-3 text-[#6b705c]">
            The rest of the app is still working. Try again, and if it keeps
            happening, the details below are what to pass along.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {tryAgain && (
              <button
                type="button"
                onClick={() => tryAgain()}
                className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
              >
                Try Again
              </button>
            )}

            <a
              href="/dashboard"
              className="rounded-xl border border-[#174734] bg-white px-5 py-3 text-sm font-bold text-[#174734] transition hover:bg-[#f7f6f1]"
            >
              Back to Dashboard
            </a>
          </div>

          <div className="mt-6 rounded-xl bg-[#f7f6f1] px-4 py-3 text-sm">
            {digest && (
              <p>
                <span className="font-semibold">Error code:</span> {digest}
              </p>
            )}

            {clientMessage && (
              <p className="mt-1 break-words">
                <span className="font-semibold">What went wrong:</span> {clientMessage}
              </p>
            )}

            {details.state === "loading" && (
              <p className="mt-1 text-[#6b705c]">Looking up details…</p>
            )}

            {details.state === "found" && (
              <>
                <p className="mt-1 break-words">
                  <span className="font-semibold">What went wrong:</span>{" "}
                  {details.message ?? "No message recorded."}
                </p>

                {details.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-[#6b705c]">
                      Technical details
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-[#6b705c]">
                      {details.stack}
                    </pre>
                  </details>
                )}
              </>
            )}

            {!digest && !clientMessage && (
              <p className="text-[#6b705c]">No further details were recorded.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
