// Where an incoming call to the business number rings: the cell number saved
// on each admin's Account page (all at once), not the Google Voice number.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { pickForwardNumbers } from "@/lib/callForwardingLogic";

export async function getForwardingNumbers(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("users")
    .select("phone")
    .eq("role", "admin")
    .not("phone", "is", null);

  // A missing column or failed lookup falls back to the alert phone, so a
  // call is never left with nobody to ring.
  const saved = error ? [] : (data ?? []).map((row) => row.phone as string | null);

  return pickForwardNumbers(saved, process.env.ALERT_PHONE || "+14803314596");
}
