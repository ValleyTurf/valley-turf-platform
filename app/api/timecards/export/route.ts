// CSV download for a payroll period — manager/admin only. Not under
// app/(platform), so (platform)/layout.tsx's permission gate doesn't
// cover it (that only wraps page children, not API routes); the role
// check below is the real enforcement here, same as
// app/api/backup/export/route.ts's requireAdmin() check.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireManager } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { rowsToCsv } from "@/lib/csv";
import { totalMinutes, minutesToDecimalHours } from "@/lib/shiftHours";

type UserRow = { id: string; name: string };

type ShiftRow = {
  user_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  notes: string | null;
};

function phoenixDayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function phoenixTime(iso: string | null): string {
  if (!iso) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Phoenix",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function GET(request: Request) {
  try {
    await requireManager();
  } catch {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start/end date." }, { status: 400 });
  }

  const [{ data: usersData }, { data: shiftsData, error }] = await Promise.all([
    supabaseServer.from("users").select("id, name"),
    supabaseServer
      .from("shift_time_logs")
      .select("user_id, clocked_in_at, clocked_out_at, notes")
      .gte("clocked_in_at", `${start}T00:00:00-07:00`)
      .lt("clocked_in_at", `${end}T00:00:00-07:00`)
      .order("clocked_in_at", { ascending: true }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userNameById = new Map<string, string>(
    ((usersData ?? []) as UserRow[]).map((u) => [u.id, u.name])
  );

  const rows = ((shiftsData ?? []) as ShiftRow[]).map((shift) => {
    const minutes = totalMinutes(
      [{ clockedInAt: shift.clocked_in_at, clockedOutAt: shift.clocked_out_at }],
      { includeActive: true }
    );

    return {
      employee: userNameById.get(shift.user_id) ?? "Unknown",
      date: phoenixDayKey(shift.clocked_in_at),
      clock_in: phoenixTime(shift.clocked_in_at),
      clock_out: shift.clocked_out_at ? phoenixTime(shift.clocked_out_at) : "still clocked in",
      hours: minutesToDecimalHours(minutes),
      notes: shift.notes ?? "",
    };
  });

  const csv = rowsToCsv(rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timecards-${start}-to-${end}.csv"`,
    },
  });
}
