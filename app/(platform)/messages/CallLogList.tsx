// Compact list of recent calls and voicemails on the Messages page. Missed
// calls and voicemails get a Call back button (rings your cell from the
// business number, then connects).
import Link from "next/link";
import BusinessCallButton from "@/app/components/BusinessCallButton";
import { callKindLabel, needsCallback } from "@/lib/callLogLogic";
import type { CallLogEntry } from "@/lib/callLog";
import UnknownCallActions from "./UnknownCallActions";

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

const KIND_STYLE: Record<string, string> = {
  voicemail: "bg-[#faf4e3] text-[#9c7a20]",
  missed: "bg-[#fbe9e7] text-[#9a2f22]",
  answered: "bg-[#e6f0e9] text-[#174734]",
  outgoing: "bg-[#f1eee4] text-[#6b705c]",
};

export default function CallLogList({ entries }: { entries: CallLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl bg-[#f7f6f1] p-4 text-sm text-[#6b705c]">
        No calls or voicemails in the last 14 days.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[#efebdf]">
      {entries.map((entry) => {
        const detail = entry.summary?.replace(/^Voicemail -- /, "") ?? "";

        return (
          <div key={entry.id} className="py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 flex-1 truncate text-sm font-bold">
                {entry.jobberClientId ? (
                  <Link
                    href={`/customers/${encodeURIComponent(entry.jobberClientId)}`}
                    className="hover:underline"
                  >
                    {entry.name}
                  </Link>
                ) : (
                  entry.phone ?? "Unknown caller"
                )}
              </p>

              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${KIND_STYLE[entry.kind]}`}>
                {callKindLabel(entry.kind)}
              </span>

              <span className="text-xs text-[#9c9887]">
                {formatTimestamp(entry.createdAt)}
                {detail && entry.kind !== "missed" ? ` · ${detail}` : ""}
              </span>

              {needsCallback(entry.kind) ? (
                entry.jobberClientId ? (
                  <BusinessCallButton
                    jobberClientId={entry.jobberClientId}
                    className="rounded-full border border-[#174734] px-3 py-1 text-xs font-bold hover:bg-[#f7f6f1] disabled:opacity-60"
                  >
                    Call back
                  </BusinessCallButton>
                ) : entry.phone ? (
                  <BusinessCallButton
                    phone={entry.phone}
                    className="rounded-full border border-[#174734] px-3 py-1 text-xs font-bold hover:bg-[#f7f6f1] disabled:opacity-60"
                  >
                    Call back
                  </BusinessCallButton>
                ) : null
              ) : null}

              {entry.id.startsWith("u-") ? (
                <UnknownCallActions contactId={entry.id.slice(2)} />
              ) : null}
            </div>

            {entry.recordingSid ? (
              <audio
                controls
                preload="none"
                src={`/api/voicemail/${entry.recordingSid}`}
                className="mt-1.5 h-8 w-full max-w-sm"
              />
            ) : null}
          </div>
        );
      })}
      <p className="pt-3 text-center text-xs text-[#9c9887]">
        Showing the last 14 days. Older calls are on each customer&apos;s page.
      </p>
    </div>
  );
}
