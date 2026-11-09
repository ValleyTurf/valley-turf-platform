export const dynamic = "force-dynamic";
export const revalidate = 0;

// Settings page for managing which color each service type gets on the
// Schedule (schedule_service_colors table, migration
// 104_schedule_service_colors.sql) -- previously a hardcoded array in
// app/(platform)/schedule/page.tsx that needed a code change every time
// Ryan wanted to move a service to a different color. Built after he
// asked (2026-11-09) "We set colors for the different cleanings in the
// schedule. Is there a menu where I can go and change these colors?" and
// chose a Settings page over a one-off code change. Mirrors
// settings/referral-sources/page.tsx's shell/inline-style convention;
// the interactive rule list lives in ScheduleColorsManager.tsx.
import Link from "next/link";
import { fetchServiceColorRules } from "@/lib/scheduleServiceColors";
import ScheduleColorsManager from "./ScheduleColorsManager";

export default async function ScheduleColorsSettingsPage() {
  const rules = await fetchServiceColorRules();

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
            Schedule Colors
          </h1>

          <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>
            Which color each service type shows as on the Schedule&apos;s
            grid, map pins, and visit cards. Add, recolor, reorder, or
            remove a rule any time -- no code change needed.
          </p>
        </div>

        <ScheduleColorsManager rules={rules} />
      </div>
    </main>
  );
}
