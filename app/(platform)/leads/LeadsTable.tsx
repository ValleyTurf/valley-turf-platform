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
import { setLeadStatus, deleteLead } from "./actions";
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
  statusClassName: string;
  scanCount: number | null;
  customerMatch: { jobberClientId: string; label: string } | null;
  // Precomputed once server-side (lowercased, all searchable fields
  // joined) so every keystroke is just a substring check, not a
  // recomputation across every field of every row.
  searchText: string;
};

export default function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) return rows;

    return rows.filter((row) => row.searchText.includes(needle));
  }, [rows, query]);

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

        {query && (
          <p className="mt-2 text-xs text-[#6b705c]">
            {filteredRows.length} of {rows.length} leads match
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
                  <td className="py-2 pr-4">{row.name}</td>
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
                      className={`rounded-full px-2 py-1 text-xs font-bold ${row.statusClassName}`}
                    >
                      {row.status}
                    </span>
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
                      <span className="text-[#6b705c]">Not a customer yet</span>
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
