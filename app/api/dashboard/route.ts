import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 7);

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
        .select("*", { count: "exact", head: true }),

      supabaseServer
        .from("campaigns")
        .select("*", { count: "exact", head: true }),

      supabaseServer
        .from("scans")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString()),

      supabaseServer
        .from("scans")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekStart.toISOString()),

      supabaseServer
        .from("leads")
        .select("*", { count: "exact", head: true }),

      supabaseServer
        .from("scans")
        .select(`
          id,
          created_at,
          city,
          region,
          country,
          campaigns (
            name,
            alias,
            slug
          )
        `)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({
      success: true,

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
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Dashboard failed to load.",
      },
      {
        status: 500,
      }
    );
  }
}