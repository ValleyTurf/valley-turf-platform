// Ryan (2026-10-25): "Can you reset the timer for Katie Ray's job from
// today? I started it and then she ended up rescheduling to tomorrow."
//
// startVisitTimer/stopVisitTimer (my-day/actions.ts) have no delete --
// stopping a timer just sets stopped_at, and my-day/page.tsx's
// loggedMinutesByVisit sums every stopped segment for a visit forever
// (by design -- "stopping and restarting... never actually lost", see
// VisitTimer.tsx's own comment). That's right for a paused-and-resumed
// job, but wrong here: the visit got rescheduled before any real work
// happened, so today's segment isn't time actually spent on the job --
// it's a false start that would otherwise sit there and inflate
// tomorrow's "logged Xm" baseline and job-costing labor numbers for a
// job that hasn't happened yet. Same reasoning as
// void-duplicate-invoice/route.ts for an accidental duplicate invoice:
// delete the specific row rather than trying to zero it out in place,
// so there's nothing left to double-count, but it's a one-off,
// confirm-first action rather than a button anyone can mis-click.
//
// GET with ?customer=Katie%20Ray -- dry run, lists every jobber_visits
// row matching that name plus every visit_time_logs row (active or
// stopped) tied to any of them, so the right row is obvious before
// anything is touched.
// GET with the same ?customer= plus &timeLogId=<id>&apply=true --
// deletes that one visit_time_logs row.
//
// Read-only unless apply=true. Admin-gated, manual-trigger only.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { supabaseServer } from "@/lib/supabase-server";
import { recordAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  let actor;

  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const customerName = request.nextUrl.searchParams.get("customer");
  const timeLogId = request.nextUrl.searchParams.get("timeLogId");
  const apply = request.nextUrl.searchParams.get("apply") === "true";

  if (!customerName) {
    return NextResponse.json(
      { error: "Pass ?customer=Katie Ray" },
      { status: 400 }
    );
  }

  const { data: visits, error: visitsError } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, customer_name, title, visit_status, start_at, completed_at")
    .ilike("customer_name", `%${customerName}%`)
    .order("start_at", { ascending: false });

  if (visitsError) {
    return NextResponse.json(
      { error: visitsError.message, step: "jobber_visits" },
      { status: 500 }
    );
  }

  const visitIds = (visits ?? []).map((v) => v.jobber_visit_id as string);

  const { data: timeLogs, error: timeLogsError } = visitIds.length
    ? await supabaseServer
        .from("visit_time_logs")
        .select("id, jobber_visit_id, user_id, started_at, stopped_at")
        .in("jobber_visit_id", visitIds)
        .order("started_at", { ascending: false })
    : { data: [], error: null };

  if (timeLogsError) {
    return NextResponse.json(
      { error: timeLogsError.message, step: "visit_time_logs" },
      { status: 500 }
    );
  }

  const userIds = Array.from(
    new Set((timeLogs ?? []).map((log) => log.user_id as string))
  );

  const { data: users, error: usersError } = userIds.length
    ? await supabaseServer.from("users").select("id, name").in("id", userIds)
    : { data: [], error: null };

  if (usersError) {
    return NextResponse.json(
      { error: usersError.message, step: "users" },
      { status: 500 }
    );
  }

  const userNameById = new Map(
    ((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name])
  );

  const visitById = new Map(
    (visits ?? []).map((v) => [v.jobber_visit_id as string, v])
  );

  const annotatedTimeLogs = (timeLogs ?? []).map((log) => ({
    ...log,
    loggedByName: userNameById.get(log.user_id as string) ?? "Unknown",
    visit: visitById.get(log.jobber_visit_id as string) ?? null,
  }));

  if (!apply) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      searchedFor: customerName,
      visits,
      timeLogs: annotatedTimeLogs,
      wouldDeleteTimeLogId: timeLogId ?? null,
    });
  }

  if (!timeLogId) {
    return NextResponse.json(
      { error: "Pass &timeLogId=<id> (from the dry-run list above) with apply=true." },
      { status: 400 }
    );
  }

  const targetLog = annotatedTimeLogs.find((log) => log.id === timeLogId);

  if (!targetLog) {
    return NextResponse.json(
      {
        error: `No visit_time_logs row with id ${timeLogId} found among ${customerName}'s visits.`,
        timeLogs: annotatedTimeLogs,
      },
      { status: 404 }
    );
  }

  const { error: deleteError } = await supabaseServer
    .from("visit_time_logs")
    .delete()
    .eq("id", timeLogId);

  if (deleteError) {
    return NextResponse.json(
      { success: false, error: deleteError.message, step: "delete" },
      { status: 500 }
    );
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "visit_time_log",
    entityId: timeLogId,
    entityLabel: `${targetLog.visit?.customer_name ?? customerName} — timer reset (job rescheduled)`,
    before: {
      jobber_visit_id: targetLog.jobber_visit_id,
      user_id: targetLog.user_id,
      started_at: targetLog.started_at,
      stopped_at: targetLog.stopped_at,
    },
    note: "Deleted: visit was rescheduled before the job actually happened, so this segment wasn't real logged time.",
  });

  return NextResponse.json({
    success: true,
    applied: true,
    deletedTimeLog: targetLog,
  });
}
