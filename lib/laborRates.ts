// Keeps the point-in-time "Labor - <name>" rows in the materials table
// (Materials & Costs' "Current Labor Rates" box, matched by job costing
// via lib/laborMaterialName.ts) in sync with a single edit on Team's
// Hourly Rate field.
//
// Before this, Team's Hourly Rate (users.hourly_rate, used only by
// /timecards and /timeclock for payroll) and Materials & Costs' Labor
// Rates (date-ranged rows in materials, used only by job costing) were
// two disconnected numbers for the same thing -- staff had to enter a
// rate change in both places, and forgetting the second one (as
// happened: Finnley and Ryan had a Labor Rate entry but no Team hourly
// rate, so Timecards' Pay column showed blank) silently broke payroll
// while job costing kept working, or vice versa.
//
// Team is now the one place staff edit pay rate. Call
// syncLaborRateForUser after every users insert/update that touches
// hourly_rate, and it does exactly what a manual Materials & Costs edit
// used to require by hand: close out the old open-ended labor-rate row
// and open a new one dated today, so job costing on past jobs keeps
// using whatever rate was actually in effect then.
import { supabaseServer } from "@/lib/supabase-server";
import { formatLaborMaterialName } from "@/lib/laborMaterialName";
import { getPhoenixTodayKey } from "@/lib/payPeriods";

// Calendar-day math on a YYYY-MM-DD key, not a real timestamp -- same
// Date.UTC approach lib/payPeriods.ts uses for daysInMonth(), to avoid
// any DST/timezone drift from treating this as a moment instead of a
// plain date.
function dayBefore(dateKeyStr: string): string {
  const [year, month, day] = dateKeyStr.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 1, day - 1));

  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(
    prev.getUTCDate()
  ).padStart(2, "0")}`;
}

type OpenLaborRow = {
  id: string;
  name: string;
  unit_cost: number | string;
  start_date: string | null;
};

export async function syncLaborRateForUser(
  userId: string,
  name: string,
  hourlyRate: number | null
): Promise<void> {
  const today = getPhoenixTodayKey();

  // The currently open-ended labor-rate row for this person, if any --
  // "open" (no end_date) is what job-costs' active-rate selector and
  // job-costing-analytics' point-in-time lookup both treat as "in
  // effect now and until further notice."
  // .limit(1) rather than .maybeSingle() -- a pre-existing manual entry
  // could in theory have left more than one open row for the same
  // person (nothing before this enforced uniqueness); grabbing the most
  // recently started one and syncing off that is safer than erroring
  // out and skipping the sync entirely.
  const { data: openRows, error: lookupError } = await supabaseServer
    .from("materials")
    .select("id, name, unit_cost, start_date")
    .eq("user_id", userId)
    .eq("unit_label", "hour")
    .is("end_date", null)
    .order("start_date", { ascending: false })
    .limit(1);

  if (lookupError) {
    // Don't block the Team save over this -- payroll (users.hourly_rate)
    // already saved successfully; a sync failure here just means job
    // costing keeps using whatever rate it had until someone retries or
    // fixes it by hand on Materials & Costs.
    console.error(`Labor rate sync lookup failed for user ${userId}:`, lookupError.message);
    return;
  }

  const open = (openRows?.[0] as OpenLaborRow | undefined) ?? null;
  const currentRate = open ? Number(open.unit_cost) : null;
  const canonicalName = formatLaborMaterialName(name);

  if (hourlyRate === null) {
    // Rate cleared in Team -- end the open row (if any) so job costing
    // stops picking up a rate for this person going forward. Past jobs
    // already logged keep whatever rate was in effect at the time.
    if (open) {
      const { error } = await supabaseServer
        .from("materials")
        .update({ end_date: dayBefore(today) })
        .eq("id", open.id);

      if (error) {
        console.error(`Labor rate sync end-date failed for user ${userId}:`, error.message);
      }
    }
    return;
  }

  if (open && currentRate === hourlyRate) {
    // Rate unchanged -- just keep the name in sync (Team lets you
    // rename someone without touching their rate).
    if (open.name !== canonicalName) {
      const { error } = await supabaseServer
        .from("materials")
        .update({ name: canonicalName })
        .eq("id", open.id);

      if (error) {
        console.error(`Labor rate sync rename failed for user ${userId}:`, error.message);
      }
    }
    return;
  }

  if (open && open.start_date === today) {
    // Already changed today (e.g. two edits in Team in the same day) --
    // update the existing row in place instead of end-dating it to
    // yesterday, which would leave it with an end_date before its own
    // start_date.
    const { error } = await supabaseServer
      .from("materials")
      .update({ name: canonicalName, unit_cost: hourlyRate })
      .eq("id", open.id);

    if (error) {
      console.error(`Labor rate sync update failed for user ${userId}:`, error.message);
    }
    return;
  }

  if (open) {
    // Rate changed on a different day -- close out the old row as of
    // yesterday so today onward uses the new one, without rewriting
    // history for jobs already logged against the old rate.
    const { error } = await supabaseServer
      .from("materials")
      .update({ end_date: dayBefore(today) })
      .eq("id", open.id);

    if (error) {
      console.error(`Labor rate sync end-date failed for user ${userId}:`, error.message);
      return;
    }
  }

  const { error: insertError } = await supabaseServer.from("materials").insert({
    name: canonicalName,
    unit_label: "hour",
    unit_cost: hourlyRate,
    start_date: today,
    end_date: null,
    user_id: userId,
  });

  if (insertError) {
    console.error(`Labor rate sync insert failed for user ${userId}:`, insertError.message);
  }
}
