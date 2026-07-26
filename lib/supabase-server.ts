// Build-time backstop for the exact bug class this file already caused
// an outage from once (see the comment in lib/permissionRules.ts and
// app/components/layout/Sidebar.tsx): if any Client Component ever
// transitively imports this module again, Next.js's bundler now refuses
// to ship it to the browser instead of silently inlining
// SUPABASE_SERVICE_ROLE_KEY-reading code into client JS and crashing
// hydration on load. lib/clientServerBoundary.test.ts is the other half
// of this guard — same invariant, checked earlier (at `npm test` time)
// and without needing a real build.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
