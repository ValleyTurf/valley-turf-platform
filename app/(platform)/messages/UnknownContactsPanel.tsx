"use client";

// Client half of the "Unknown senders" review queue -- the page itself
// (app/(platform)/messages/page.tsx) is a Server Component and reads
// listNewUnknownContacts() at request time, but "Add as Lead"/"Dismiss"
// need an onClick, so that part lives here. See lib/unknownContactActions.ts
// for what each button actually does server-side.
import { useState, useTransition } from "react";
import type { UnknownContact } from "@/lib/unknownContacts";
import { addUnknownContactAsLead, dismissUnknownContact } from "@/lib/unknownContactActions";

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

export default function UnknownContactsPanel({
  contacts,
}: {
  contacts: UnknownContact[];
}) {
  // Optimistically dropped from the list the moment an action succeeds --
  // revalidatePath will also refresh this data on the next navigation, but
  // removing it here immediately means Ryan doesn't sit looking at a
  // resolved row until then.
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = contacts.filter((contact) => !handledIds.has(contact.id));

  function handleAddAsLead(id: string) {
    setPendingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));

    startTransition(async () => {
      const result = await addUnknownContactAsLead(id);

      if (result.error) {
        setErrorById((prev) => ({ ...prev, [id]: result.error as string }));
      } else {
        setHandledIds((prev) => new Set(prev).add(id));
      }

      setPendingId(null);
    });
  }

  function handleDismiss(id: string) {
    setPendingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));

    startTransition(async () => {
      const result = await dismissUnknownContact(id);

      if (result.error) {
        setErrorById((prev) => ({ ...prev, [id]: result.error as string }));
      } else {
        setHandledIds((prev) => new Set(prev).add(id));
      }

      setPendingId(null);
    });
  }

  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 rounded-3xl bg-white p-5 shadow sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Unknown senders</h2>
        <span className="text-xs font-semibold text-[#9c7a20]">
          {visible.length} to review
        </span>
      </div>

      <p className="mt-2 text-sm text-[#6b705c]">
        Texts and emails from a phone number or address that doesn&apos;t
        match anyone on file. Could be a new prospect -- add them as a lead,
        or dismiss if it&apos;s spam or a wrong number.
      </p>

      <div className="mt-4 space-y-2">
        {visible.map((contact) => {
          const icon = contact.channel === "sms" ? "💬" : "✉️";
          const identity = contact.phone || contact.email || "Unknown";
          const busy = isPending && pendingId === contact.id;
          const error = errorById[contact.id];

          return (
            <div
              key={contact.id}
              className="rounded-2xl border border-[#e7e2d5] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {icon} {identity}
                  </p>
                  {contact.summary ? (
                    <p className="mt-1 truncate text-xs text-[#6b705c]">
                      {contact.summary}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-[#9c9887]">
                    {formatTimestamp(contact.createdAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDismiss(contact.id)}
                    disabled={busy}
                    className="rounded-full border border-[#e7e2d5] px-3 py-1.5 text-xs font-bold text-[#6b705c] transition hover:border-[#d4af37] disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddAsLead(contact.id)}
                    disabled={busy}
                    className="rounded-full bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Adding..." : "Add as Lead"}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
