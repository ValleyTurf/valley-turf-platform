export const dynamic = "force-dynamic";
export const revalidate = 0;

// Settings page for managing the "how did you hear about us?" option
// list (referral_sources table, migration
// 099_referral_sources_table.sql) -- previously a hardcoded list in
// lib/referralSource.ts that needed a code change + migration every
// time Ryan wanted to add one. Built after he asked (2026-10-23) to add
// per-neighborhood sources (Sky Crossing, DC Ranch -- people who heard
// about Valley Turf Revival from someone in that community without
// scanning that community's QR code) and wanted a way to keep adding
// those himself. Mirrors settings/autopay/page.tsx's shell/inline-style
// convention (direct sibling within Settings); the interactive list
// itself lives in ReferralSourcesManager.tsx (a client component, since
// add/rename/toggle need inline feedback the way
// CustomerContactsSection.tsx's forms do).
import Link from "next/link";
import { listAllReferralSources } from "@/lib/referralSource";
import ReferralSourcesManager from "./ReferralSourcesManager";

export default async function ReferralSourcesSettingsPage() {
  const sources = await listAllReferralSources();

  return (
    <main
      className="px-4 py-6 sm:p-8"
      style={{ minHeight: "100vh", background: "#f8fafc" }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ marginBottom: "24px" }}>
          <Link
            href="/settings"
            style={{
              color: "#64748b",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            ← Settings
          </Link>

          <h1
            style={{
              margin: "8px 0 8px",
              fontSize: "32px",
              color: "#0f172a",
            }}
          >
            Referral Sources
          </h1>

          <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
            The options customers (and staff, on their behalf) can pick
            from for &quot;How did you hear about us?&quot; Add a new one
            any time -- no code change needed.
          </p>
        </div>

        <ReferralSourcesManager sources={sources} />
      </div>
    </main>
  );
}
