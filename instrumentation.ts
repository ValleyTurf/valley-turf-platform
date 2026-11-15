// Next.js instrumentation hook. Only used for onRequestError: every
// server-side error (a page that throws while rendering, a Server
// Action, a route handler) is handed to lib/pageErrors.ts so the real
// message is kept somewhere readable -- production Next.js only ever
// shows the browser a digest number. See lib/pageErrors.ts for why.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  // lib/pageErrors.ts talks to Supabase through the Node client; the
  // Edge runtime (proxy.ts) can't load it, and isn't where pages render.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { logPageError } = await import("@/lib/pageErrors");

    const digest =
      typeof error === "object" && error !== null && "digest" in error && error.digest
        ? String(error.digest)
        : null;

    await logPageError({
      digest,
      path: request.path,
      method: request.method,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
      routePath: context.routePath ?? null,
      routeType: context.routeType ?? null,
    });
  } catch (loggingError) {
    console.error("onRequestError logging failed:", loggingError);
  }
};
