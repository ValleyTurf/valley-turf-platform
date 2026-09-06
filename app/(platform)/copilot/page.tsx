export const dynamic = "force-dynamic";
export const revalidate = 0;

// AI Copilot (Tier 1: ask-it-things, read-only). Manager+ only -- see
// lib/permissionRules.ts's MANAGER_PLUS_PREFIXES -- since it can surface
// financial and job-costing numbers a plain staff account wouldn't
// otherwise see on their own (Crew Status and Timecards are gated the
// same way, for the same reason). Enforced at the route level via
// app/(platform)/layout.tsx; this page's own role check below is
// defense in depth, same relationship as crew-status/page.tsx has with
// its own check.
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import CopilotChat from "./CopilotChat";

export default async function CopilotPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.role === "staff") {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-xl">
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="font-bold">Manager access required</p>
            <p className="mt-2 text-sm text-[#6b705c]">
              The AI Copilot can surface financial and job-costing
              numbers, so it&apos;s limited to managers and admins.{" "}
              <Link href="/my-day" className="font-semibold text-[#9c7a20] hover:underline">
                Go to My Day
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">AI Copilot</h1>

          <p className="mt-2 max-w-2xl text-[#6b705c]">
            Ask about revenue, margins, the reactivation pipeline, or a
            specific customer, and get an answer pulled straight from the
            same numbers the rest of this app shows. Read-only -- it can
            look things up, not change anything.
          </p>
        </header>

        <CopilotChat />
      </div>
    </main>
  );
}
