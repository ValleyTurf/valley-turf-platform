"use client";

// "Create Message" entry point for a customer who has no thread yet --
// Ryan's ask: "on messages, can we make a create message button for
// someone I haven't messaged yet." The per-customer thread page
// (/messages/[clientId]) already renders fine with zero prior activity
// (just "No messages yet." + the Email/Text reply box), so all this
// needs to do is get staff to that URL for any customer, not just the
// ones already surfaced by existing contact history. Reuses the same
// predictive search everywhere else in the app already uses
// (CustomerTypeahead), just pointed at /messages/[id] instead of its
// default /customers/[id] via the onSelect escape hatch.
import { useState } from "react";
import { useRouter } from "next/navigation";
import CustomerTypeahead, {
  type CustomerSearchResult,
} from "@/app/components/CustomerTypeahead";

export default function NewMessageButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSelect(result: CustomerSearchResult) {
    router.push(`/messages/${encodeURIComponent(result.jobberClientId)}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
      >
        + New Message
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm sm:w-80">
      <CustomerTypeahead
        placeholder="Search customers by name, phone, email..."
        className="w-full"
        inputClassName="w-full rounded-xl border border-[#d9d4c6] bg-white px-4 py-2.5 text-sm text-[#174734] outline-none transition placeholder:text-[#8b8d82] focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        onSelect={handleSelect}
        autoFocus
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-1.5 text-xs font-semibold text-[#6b705c] hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
