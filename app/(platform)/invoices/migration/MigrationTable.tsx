"use client";

// Selectable customer list with a batch "send invite" action. Sends nothing
// until the confirm step, and shows what happened to each customer after.
import { useState, useTransition } from "react";
import Link from "next/link";
import { sendInvitesAction } from "./actions";
import { setManualInvoicingMode } from "../routing/actions";
import type { MigrationRow, InviteResult } from "@/lib/nativeMigration";
import {
  MAX_TEMPLATE_LENGTH,
  renderInviteMessage,
  smsSegments,
  validateInviteTemplate,
} from "@/lib/nativeMigrationLogic";

const STAGE_LABEL: Record<MigrationRow["stage"], { text: string; className: string }> = {
  not_invited: { text: "Not invited", className: "bg-slate-100 text-slate-700" },
  invited: { text: "Invited", className: "bg-amber-100 text-amber-800" },
  card_saved: { text: "Card saved", className: "bg-green-100 text-green-800" },
  switched: { text: "Native", className: "bg-green-200 text-green-900" },
};

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export default function MigrationTable({
  rows,
  view,
  windowOpen,
  maxPerBatch,
  defaultTemplate,
}: {
  rows: MigrationRow[];
  view: string;
  windowOpen: boolean;
  maxPerBatch: number;
  defaultTemplate: string;
}) {
  const [template, setTemplate] = useState(defaultTemplate);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [switched, setSwitched] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const invitable = rows.filter((row) => row.stage === "not_invited" || row.stage === "invited");
  const selectedCount = selected.size;

  function toggle(id: string) {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const outcome = await sendInvitesAction(Array.from(selected), template);
      setConfirming(false);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setResults(outcome.results);
      setSelected(new Set());
    });
  }

  function switchNow(row: MigrationRow) {
    setError(null);
    startTransition(async () => {
      const outcome = await setManualInvoicingMode(row.jobberClientId, true, row.name);
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setSwitched((current) => new Set(current).add(row.jobberClientId));
    });
  }

  return (
    <div className="mt-5">
      {view !== "switched" && (
        <div className="mb-4 rounded-2xl bg-white p-4 shadow">
          <label className="block text-sm font-bold" htmlFor="invite-message">
            Your message
          </label>
          <p className="mt-0.5 text-xs text-[#6b705c]">
            This is the text each customer gets. {"{first_name}"} becomes their first name and{" "}
            {"{link}"} becomes their own secure link to save a card (keep it in the message).
            Customers with no phone number get the same words by email.
          </p>
          <textarea
            id="invite-message"
            value={template}
            onChange={(event) => {
              setTemplate(event.target.value);
              setConfirming(false);
            }}
            rows={5}
            maxLength={MAX_TEMPLATE_LENGTH}
            className="mt-2 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37]"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b705c]">
            <span>
              {template.length} characters. A real text will be a bit longer once the link is added
              (about {smsSegments(template.length + 60)} text segment
              {smsSegments(template.length + 60) === 1 ? "" : "s"}).
            </span>
            <button
              type="button"
              onClick={() => setTemplate(defaultTemplate)}
              className="font-bold text-[#7a5f12]"
            >
              Reset to suggested wording
            </button>
          </div>
          <p className="mt-3 text-xs font-bold text-[#9c7a20]">PREVIEW</p>
          <p className="mt-1 whitespace-pre-wrap rounded-xl bg-[#f7f6f1] p-3 text-sm">
            {renderInviteMessage(template || " ", {
              firstName: "Chris",
              link: "https://go.valleyturfrevival.com/autopay/abc123...",
            })}
          </p>
          {validateInviteTemplate(template) && (
            <p className="mt-2 text-xs font-semibold text-red-600">{validateInviteTemplate(template)}</p>
          )}
        </div>
      )}

      {view !== "switched" && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={
              !windowOpen ||
              selectedCount === 0 ||
              selectedCount > maxPerBatch ||
              isPending ||
              validateInviteTemplate(template) !== null
            }
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Send invite to {selectedCount || "selected"}
          </button>
          <p className="text-xs text-[#6b705c]">
            Up to {maxPerBatch} at a time. Anyone already invited in the last 3 days is skipped.
          </p>
        </div>
      )}

      {confirming && (
        <div className="mb-3 rounded-2xl border border-[#d9d4c6] bg-white p-4 text-sm">
          <p className="font-bold">
            Text {selectedCount} customer{selectedCount === 1 ? "" : "s"} a link to save a card?
          </p>
          <p className="mt-1 text-[#6b705c]">
            Each gets the message you wrote above, with their own name and link. Customers with no
            phone number get it by email instead. Once they save a card, they switch to native
            invoicing automatically.
          </p>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-[#f7f6f1] p-3">
            {renderInviteMessage(template, {
              firstName: "Chris",
              link: "https://go.valleyturfrevival.com/autopay/abc123...",
            })}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={isPending}
              className="rounded-xl bg-[#174734] px-4 py-2 font-bold text-white disabled:opacity-60"
            >
              {isPending ? "Sending..." : "Yes, send"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="rounded-xl border border-[#d9d4c6] px-4 py-2 font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

      {results && (
        <div className="mb-3 rounded-2xl border border-[#d9d4c6] bg-white p-4 text-sm">
          <p className="font-bold">
            Done: {results.filter((r) => r.outcome.startsWith("sent")).length} sent,{" "}
            {results.filter((r) => r.outcome === "skipped").length} skipped,{" "}
            {results.filter((r) => r.outcome === "failed").length} failed
          </p>
          <ul className="mt-2 space-y-0.5">
            {results.map((result) => (
              <li key={result.jobberClientId} className={result.outcome === "failed" ? "text-red-700" : ""}>
                {result.name}: {result.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-[#6b705c]">No customers in this view.</p>
        ) : (
          <ul className="divide-y divide-[#f0eee6]">
            {rows.map((row) => {
              const stage = switched.has(row.jobberClientId) ? STAGE_LABEL.switched : STAGE_LABEL[row.stage];
              const canSelect = invitable.includes(row) && !switched.has(row.jobberClientId);
              return (
                <li key={row.jobberClientId} className="flex items-center gap-3 px-4 py-3">
                  {view !== "switched" && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.jobberClientId)}
                      disabled={!canSelect}
                      onChange={() => toggle(row.jobberClientId)}
                      aria-label={`Select ${row.name}`}
                      className="h-4 w-4"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/customers/${encodeURIComponent(row.jobberClientId)}`}
                      className="font-semibold text-[#174734]"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-[#6b705c]">
                      {row.phone ? "Has phone" : row.email ? "Email only" : "No phone or email"}
                      {row.optedOut ? " · Opted out of messages" : ""}
                      {row.cardInJobber ? " · Card in Jobber" : ""}
                      {row.cardLast4 ? ` · Saved card ending ${row.cardLast4}` : ""}
                      {row.lastInvitedAt
                        ? ` · Invited ${formatDay(row.lastInvitedAt)} by ${row.lastInviteChannel === "email" ? "email" : "text"}`
                        : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${stage.className}`}>
                    {stage.text}
                  </span>
                  {row.stage === "card_saved" && !switched.has(row.jobberClientId) && (
                    <button
                      type="button"
                      onClick={() => switchNow(row)}
                      disabled={isPending}
                      className="rounded-lg border border-[#174734] px-2.5 py-1 text-xs font-bold disabled:opacity-60"
                    >
                      Switch to native
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
