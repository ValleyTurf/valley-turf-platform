// Recent calls for the Messages page: calls and voicemails from saved
// customers (contact_history) plus callers who are not on file
// (unknown_contacts), newest first.
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { listNewUnknownContacts } from "@/lib/unknownContacts";
import { classifyCall, type CallKind } from "@/lib/callLogLogic";

export type CallLogEntry = {
  id: string;
  kind: CallKind;
  jobberClientId: string | null;
  name: string | null;
  phone: string | null;
  summary: string | null;
  recordingSid: string | null;
  createdAt: string;
};

export async function loadCallLog(limit = 40): Promise<CallLogEntry[]> {
  const [historyResult, unknown] = await Promise.all([
    supabaseServer
      .from("contact_history")
      .select("id, jobber_client_id, direction, summary, related_type, related_id, created_at")
      .eq("channel", "call")
      .order("created_at", { ascending: false })
      .limit(limit),
    listNewUnknownContacts().catch(() => []),
  ]);

  const rows = historyResult.error ? [] : historyResult.data ?? [];
  const clientIds = Array.from(new Set(rows.map((r) => r.jobber_client_id as string | null).filter(Boolean))) as string[];
  const names = new Map<string, string>();

  if (clientIds.length > 0) {
    const { data } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", clientIds);

    for (const c of data ?? []) {
      names.set(c.jobber_client_id as string, (c.full_name as string | null) || "Unnamed Customer");
    }
  }

  const entries: CallLogEntry[] = rows.map((r) => ({
    id: `h-${r.id}`,
    kind: classifyCall({
      direction: r.direction as string | null,
      relatedType: r.related_type as string | null,
      summary: r.summary as string | null,
    }),
    jobberClientId: (r.jobber_client_id as string | null) ?? null,
    name: r.jobber_client_id ? names.get(r.jobber_client_id as string) ?? "Customer" : null,
    phone: null,
    summary: (r.summary as string | null) ?? null,
    recordingSid: r.related_type === "voicemail" ? ((r.related_id as string | null) ?? null) : null,
    createdAt: r.created_at as string,
  }));

  for (const u of unknown.filter((c) => c.channel === "call")) {
    entries.push({
      id: `u-${u.id}`,
      kind: classifyCall({ direction: "inbound", relatedType: u.recordingSid ? "voicemail" : null, summary: u.summary }),
      jobberClientId: null,
      name: null,
      phone: u.phone,
      summary: u.summary,
      recordingSid: u.recordingSid,
      createdAt: u.createdAt,
    });
  }

  return entries
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
