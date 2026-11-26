// Recent voicemails left by saved customers (callers who are not on file
// show up in the Unknown senders list instead). Each one has a player, so a
// voicemail is one tap away from the Messages page.
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

type VoicemailRow = {
  id: string;
  jobber_client_id: string | null;
  summary: string | null;
  related_id: string | null;
  created_at: string;
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function VoicemailsPanel() {
  const { data, error } = await supabaseServer
    .from("contact_history")
    .select("id, jobber_client_id, summary, related_id, created_at")
    .eq("related_type", "voicemail")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) return null;

  const rows = data as VoicemailRow[];
  const ids = Array.from(new Set(rows.map((r) => r.jobber_client_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();

  if (ids.length > 0) {
    const { data: customers } = await supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name")
      .in("jobber_client_id", ids);

    for (const c of customers ?? []) {
      names.set(c.jobber_client_id as string, (c.full_name as string | null) || "Unnamed Customer");
    }
  }

  return (
    <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Voicemails</h2>
        <span className="text-xs font-semibold text-[#9c7a20]">Most recent {rows.length}</span>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-[#e7e2d5] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {row.jobber_client_id ? (
                  <Link
                    href={`/customers/${encodeURIComponent(row.jobber_client_id)}`}
                    className="hover:underline"
                  >
                    {names.get(row.jobber_client_id) ?? "Customer"}
                  </Link>
                ) : (
                  "Unknown caller"
                )}
              </p>
              <p className="text-xs text-[#9c9887]">
                {formatTimestamp(row.created_at)}
                {row.summary ? ` · ${row.summary.replace(/^Voicemail -- /, "")}` : ""}
              </p>
            </div>

            {row.related_id ? (
              <audio
                controls
                preload="none"
                src={`/api/voicemail/${row.related_id}`}
                className="mt-2 h-9 w-full max-w-sm"
              />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
