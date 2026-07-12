import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PHOENIX_TIME_ZONE = "America/Phoenix";

function getPhoenixDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PHOENIX_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(
      parts.find((part) => part.type === "year")?.value ?? 0
    ),
    month: Number(
      parts.find((part) => part.type === "month")?.value ?? 1
    ),
    day: Number(
      parts.find((part) => part.type === "day")?.value ?? 1
    ),
  };
}

function getPhoenixStartOfDayUtc(date = new Date()): Date {
  const { year, month, day } = getPhoenixDateParts(date);

  // Phoenix stays on MST (UTC-7) year-round.
  // Midnight Phoenix = 07:00 UTC.
  return new Date(
    Date.UTC(year, month - 1, day, 7, 0, 0, 0)
  );
}

export async function GET() {
  try {
    const phoenixTodayStart = getPhoenixStartOfDayUtc();

    const phoenixWeekStart = new Date(phoenixTodayStart);

    phoenixWeekStart.setUTCDate(
      phoenixWeekStart.getUTCDate() - 7
    );

    const [
      customers,
      campaigns,
      scansToday,
      scansWeek,
      leads,
      recentActivity,
    ] = await Promise.all([
      supabaseServer
        .from("customers")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseServer
        .from("campaigns")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseServer
        .from("scans")
        .select("*", {
          count: "exact",
          head: true,
        })
        .gte(
          "scanned_at",
          phoenixTodayStart.toISOString()
        ),

      supabaseServer
        .from("scans")
        .select("*", {
          count: "exact",
          head: true,
        })
        .gte(
          "scanned_at",
          phoenixWeekStart.toISOString()
        ),

      supabaseServer
        .from("leads")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseServer
        .from("scans")
        .select(`
          id,
          scanned_at,
          city,
          region,
          country,
          campaigns (
            name,
            alias,
            slug
          )
        `)
        .order("scanned_at", {
          ascending: false,
        })
        .limit(10),
    ]);

    const queryErrors = [
      customers.error,
      campaigns.error,
      scansToday.error,
      scansWeek.error,
      leads.error,
      recentActivity.error,
    ].filter(Boolean);

    if (queryErrors.length > 0) {
      throw new Error(
        queryErrors
          .map((error) => error?.message)
          .filter(Boolean)
          .join(", ")
      );
    }

    return NextResponse.json({
      success: true,

      timezone: PHOENIX_TIME_ZONE,

      dateRange: {
        todayStartsAt:
          phoenixTodayStart.toISOString(),
        weekStartsAt:
          phoenixWeekStart.toISOString(),
      },

      kpis: {
        customers: customers.count ?? 0,
        campaigns: campaigns.count ?? 0,
        leads: leads.count ?? 0,
        scansToday: scansToday.count ?? 0,
        scansWeek: scansWeek.count ?? 0,
      },

      activity: recentActivity.data ?? [],
    });
  } catch (error) {
    console.error("Dashboard API failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Dashboard failed to load.",
      },
      {
        status: 500,
      }
    );
  }
}