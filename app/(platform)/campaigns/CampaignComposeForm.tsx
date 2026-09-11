"use client";

// Step 2 of app/(platform)/campaigns/page.tsx -- the audience filters
// above this are plain server-rendered links (same searchParams pattern
// as /customers), but composing + sending needs client-side pending/
// error/result state (see actions.ts's header comment for why), so this
// one piece is its own client component.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendCampaignAction } from "./actions";
import type { CampaignChannel, CampaignFilters } from "@/lib/promoCampaigns";

export default function CampaignComposeForm({
  filters,
  audienceCount,
}: {
  filters: CampaignFilters;
  audienceCount: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [channels, setChannels] = useState<CampaignChannel[]>(["email"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sentCount: number;
    failedCount: number;
    recipientCount: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleChannel(channel: CampaignChannel) {
    setChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  }

  function handleSend() {
    setError(null);
    setResult(null);

    if (channels.length === 0) {
      setError("Pick at least one channel (email or text).");
      return;
    }

    if (channels.includes("email") && !subject.trim()) {
      setError("Write a subject line for the email.");
      return;
    }

    if (!body.trim()) {
      setError("Write a message before sending.");
      return;
    }

    // Same window.confirm mechanism app/components/ConfirmSubmitButton.tsx
    // wraps for a native <form action> submit button -- this button isn't
    // one (it calls the server action directly via useTransition so the
    // page can show an inline pending/result state instead of a full
    // redirect), so the confirm is inline here instead.
    const confirmMessage = `Send "${
      name.trim() || "this campaign"
    }" to ${audienceCount} customer${
      audienceCount === 1 ? "" : "s"
    }? This can't be undone.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    startTransition(async () => {
      const outcome = await sendCampaignAction({
        name: name.trim(),
        channels,
        subject: subject.trim(),
        body: body.trim(),
        filters,
      });

      if (outcome.error) {
        setError(outcome.error);
        return;
      }

      setResult({
        sentCount: outcome.sentCount ?? 0,
        failedCount: outcome.failedCount ?? 0,
        recipientCount: outcome.recipientCount ?? 0,
      });
      setName("");
      setSubject("");
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <input
        type="text"
        placeholder='Campaign name (internal only, e.g. "Spring Startup 2027")'
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={isPending}
        className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
      />

      <div className="flex gap-5 text-sm font-semibold text-[#174734]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={channels.includes("email")}
            onChange={() => toggleChannel("email")}
            disabled={isPending}
          />
          Email
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={channels.includes("sms")}
            onChange={() => toggleChannel("sms")}
            disabled={isPending}
          />
          Text
        </label>
      </div>

      {channels.includes("email") && (
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={isPending}
          className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
        />
      )}

      <textarea
        rows={6}
        placeholder="Write your message…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={isPending}
        className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:opacity-60"
      />

      {error && (
        <p className="text-sm font-semibold text-[#991b1b]">{error}</p>
      )}

      {result && (
        <p className="text-sm font-semibold text-[#166534]">
          Sent to {result.sentCount} of {result.recipientCount} customers
          {result.failedCount > 0
            ? ` (${result.failedCount} failed — check Contact History for details)`
            : ""}
          .
        </p>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={isPending || audienceCount === 0}
        className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending
          ? "Sending…"
          : `Send to ${audienceCount} Customer${audienceCount === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
