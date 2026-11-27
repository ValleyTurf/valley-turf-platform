"use client";

// Client-side filter-as-you-type over the full leads list. Unlike the
// /customers page (paginated, hundreds+ of rows, server-side search),
// this page has always rendered every lead in one unpaginated table --
// the whole dataset is already shipped to the browser on every load, so
// filtering it client-side (instant, no debounce, no round trip) is a
// better fit here than adding a server search param would be. Matches
// the same "type and see it narrow immediately" feel the predictive
// search elsewhere in the app has, just without a network call.
import { useMemo, useState } from "react";
import Link from "next/link";
import { setLeadStatus, deleteLead, createCustomerForLead } from "./actions";
import {
  LEAD_STAGE_ORDER,
  stageLabel,
  type LeadStage,
  type LeadStageKey,
} from "@/lib/leadPipelineLogic";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";

export type LeadRow = {
  id: string;
  capturedAt: string;
  name: string;
  phone: string | null;
  email: string | null;
  displayAddress: string | null;
  addressBadge: { label: string; className: string } | null;
  source: string | null;
  campaign: { slug: string; label: string } | null;
  status: string;
  // Lowercased raw status ("new" / "contacted" / "lost" / whatever else
  // is already on the row from Jobber-era data) -- drives which quick
  // status buttons show, separate from `status` above which is just the
  // as-stored display label.
  rawStatus: string;
  // Where the lead stands, derived from its quotes + manual status.
  stage: LeadStage;
  needsAttention: boolean;
  // "Waiting 5 h" / "Quoted in 40 min" timer text, with a color class.
  speed: { label: string; className: string } | null;
  scanCount: number | null;
  customerMatch: { jobberClientId: string; label: string } | null;
  // Precomputed once server-side (lowercased, all searchable fields
  // joined) so every keystroke is just a substring check, not a
  // recomputation across every field of every row.
  searchText: string;
};

export default function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStageKey | "all" | "attention">(
    "all"
  );

  const stageCounts = useMemo(() => {
    const counts = new Map<LeadStageKey, number>();
    for (const row of rows) {
      counts.set(row.stage.key, (counts.get(row.stage.key) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const attentionCount = useMemo(
    () => rows.filter((row) => row.needsAttention).length,
    [rows]
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (stageFilter === "attention" && !row.needsAttention) return false;
      if (
        stageFilter !== "all" &&
        stageFilter !== "attention" &&
        row.stage.key !== stageFilter
      ) {
        return false;
      }
      return !needle || row.searchText.includes(needle);
    });
  }, [rows, query, stageFilter]);

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-bold transition ${
      active
        ? "border-[#174734] bg-[#174734] text-white"
        : "border-[#d8d3c6] bg-white text-[#174734] hover:border-[#d4af37]"
    }`;

  return (
    <>
      <div className="mt-5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, email, address, source..."
          className="w-full max-w-md rounded-xl border border-[#d9d4c6] bg-white px-4 py-2.5 text-sm text-[#174734] outline-none transition placeholder:text-[#8b8d82] focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStageFilter("all")}
            className={chipClass(stageFilter === "all")}
          >
            All ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setStageFilter("attention")}
            className={chipClass(stageFilter === "attention")}
          >
            Needs attention ({attentionCount})
          </button>
          {LEAD_STAGE_ORDER.filter((key) => stageCounts.has(key)).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStageFilter(key)}
              className={chipClass(stageFilter === key)}
            >
              {stageLabel(key)} ({stageCounts.get(key)})
            </button>
          ))}
        </div>

        {(query || stageFilter !== "all") && (
          <p className="mt-2 text-xs text-[#6b705c]">
            {filteredRows.length} of {rows.length} leads shown
          </p>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        {filteredRows.length === 0 ? (
          <p className="text-sm text-[#6b705c]">
            No leads match &quot;{query}&quot;.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#e7e2d5] text-[#6b705c]">
                <th className="pb-2 pr-4">Captured</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Phone</th>
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Address</th>
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2 pr-4">Campaign</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Scans</th>
                <th className="pb-2 pr-4">Customer Match</th>
                <th className="pb-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-[#f0eee6]">
                  <td className="whitespace-nowrap py-2 pr-4">
                    {row.capturedAt}
                  </td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/leads/${encodeURIComponent(row.id)}`}
                      className="font-semibold text-[#174734] hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{row.phone || "—"}</td>
                  <td className="py-2 pr-4">{row.email || "—"}</td>
                  <td className="py-2 pr-4">
                    {row.displayAddress ? (
                      <div className="flex flex-col gap-1">
                        <span>{row.displayAddress}</span>
                        {row.addressBadge && (
                          <span
                            className={`w-fit rounded-full px-2 py-0.5 text-xs font-bold ${row.addressBadge.className}`}
                          >
                            {row.addressBadge.label}
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4">{row.source || "—"}</td>
                  <td className="py-2 pr-4">
                    {row.campaign ? (
                      <Link
                        href={`/campaigns/${row.campaign.slug}`}
                        className="font-semibold text-[#174734] hover:underline"
                      >
                        {row.campaign.label}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold ${row.stage.className}`}
                    >
                      {row.stage.label}
                    </span>
                    {row.stage.detail && (
                      <p className="mt-1 text-xs text-[#6b705c]">
                        {row.stage.detail}
                      </p>
                    )}
                    {row.speed && (
                      <p className={`mt-1 text-xs ${row.speed.className}`}>
                        {row.speed.label}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {row.scanCount && row.scanCount > 1 ? (
                      <span className="rounded-full bg-[#f0eee6] px-2 py-1 text-xs font-bold text-[#6b705c]">
                        {row.scanCount} scans
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {row.customerMatch ? (
                      <Link
                        href={`/customers/${encodeURIComponent(
                          row.customerMatch.jobberClientId
                        )}`}
                        className="font-semibold text-[#174734] hover:underline"
                      >
                        {row.customerMatch.label}
                      </Link>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-[#6b705c]">Not linked yet</span>
                        <form action={createCustomerForLead.bind(null, row.id)}>
                          <button
                            type="submit"
                            className="rounded-lg border border-[#174734] bg-white px-2 py-0.5 text-xs font-bold text-[#174734] transition hover:bg-[#174734] hover:text-white"
                          >
                            Add as Customer
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/quotes/new?leadId=${encodeURIComponent(row.id)}`}
                        className="rounded-lg bg-[#174734] px-2.5 py-1 text-xs font-bold text-white transition hover:bg-[#226246]"
                      >
                        Create Quote
                      </Link>

                      {row.rawStatus !== "contacted" && (
                        <form
                          action={setLeadStatus.bind(null, row.id, "contacted")}
                        >
                          <button
                            type="submit"
                            className="rounded-lg border border-[#d8d3c6] bg-white px-2.5 py-1 text-xs font-bold text-[#174734] transition hover:border-[#d4af37]"
                          >
                            Mark Contacted
                          </button>
                        </form>
                      )}

                      {row.rawStatus !== "needs_info" && (
                        <form
                          action={setLeadStatus.bind(null, row.id, "needs_info")}
                        >
                          <button
                            type="submit"
                            className="rounded-lg border border-[#d8d3c6] bg-white px-2.5 py-1 text-xs font-bold text-orange-800 transition hover:border-orange-300"
                          >
                            Can&apos;t Quote
                          </button>
                        </form>
                      )}

                      {row.rawStatus !== "lost" && (
                        <form action={setLeadStatus.bind(null, row.id, "lost")}>
                          <button
                            type="submit"
                            className="rounded-lg border border-[#d8d3c6] bg-white px-2.5 py-1 text-xs font-bold text-[#6b705c] transition hover:border-red-300 hover:text-red-700"
                          >
                            Mark Lost
                          </button>
                        </form>
                      )}

                      {row.rawStatus !== "new" && (
                        <form action={setLeadStatus.bind(null, row.id, "new")}>
                          <button
                            type="submit"
                            className="rounded-lg border border-[#d8d3c6] bg-white px-2.5 py-1 text-xs font-semibold text-[#6b705c] transition hover:border-[#d4af37]"
                          >
                            Reset to New
                          </button>
                        </form>
                      )}

                      <form action={deleteLead.bind(null, row.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Delete the lead for ${row.name}? This can't be undone.`}
                          className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-700 transition hover:bg-red-50"
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
