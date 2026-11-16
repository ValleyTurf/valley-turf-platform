// After two customers are merged (migration 114), the removed customer's
// id still exists in Jobber. These helpers point any late Jobber sync or
// webhook for the old id at the customer that was kept, so a merged
// customer is never brought back as a duplicate.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export async function loadCustomerAliases(): Promise<Map<string, string>> {
  const { data } = await supabaseServer
    .from("customer_aliases")
    .select("old_client_id, kept_client_id");

  return new Map(
    (data ?? []).map((row) => [row.old_client_id as string, row.kept_client_id as string])
  );
}

export function applyAlias(
  aliases: Map<string, string>,
  id: string | null | undefined
): string | null {
  if (!id) return null;
  return aliases.get(id) ?? id;
}

// One-off lookup for webhook handlers (low volume).
export async function resolveCustomerId(
  id: string | null | undefined
): Promise<string | null> {
  if (!id) return null;

  const { data } = await supabaseServer
    .from("customer_aliases")
    .select("kept_client_id")
    .eq("old_client_id", id)
    .maybeSingle();

  return (data?.kept_client_id as string | undefined) ?? id;
}

export async function isMergedAway(id: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("customer_aliases")
    .select("old_client_id")
    .eq("old_client_id", id)
    .maybeSingle();

  return Boolean(data);
}
