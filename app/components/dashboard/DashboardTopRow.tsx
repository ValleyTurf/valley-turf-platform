"use client";

// Dashboard top row (2026-09-25 rebuild): Outstanding and Leads are
// clickable and expand a panel in place -- no separate page, per Ryan's
// call after seeing the first draft. Outstanding shows only customer +
// amount (no aging/days-past-due -- he doesn't want that here). The two
// panels are mutually exclusive (opening one closes the other) to keep
// the page from growing two long lists at once.
import Link from "next/link";
import { useState } from "react";

export type OutstandingInvoiceItem = {
  id: string;
  name: string;
  amount: string;
  invoiceNumber: string;
  customerId: string | null;
};

export type LeadItem = {
  id: string;
  name: string;
  source: string;
  date: string;
};

type DashboardTopRowProps = {
  outstandingTotalLabel: string;
  outstandingCount: number;
  outstandingInvoices: OutstandingInvoiceItem[];
  leadsCount: number;
  leadsList: LeadItem[];
  leadsMoreCount: number;
  revenueThisMonthLabel: string;
  revenueComparisonLabel: string;
  newCustomersThisMonth: number;
  scansToday: number;
  scansWeek: number;
  scansMtd: number;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 6"
      fill="none"
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M1 1L5 5L9 1"
        stroke="#174734"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardTopRow({
  outstandingTotalLabel,
  outstandingCount,
  outstandingInvoices,
  leadsCount,
  leadsList,
  leadsMoreCount,
  revenueThisMonthLabel,
  revenueComparisonLabel,
  newCustomersThisMonth,
  scansToday,
  scansWeek,
  scansMtd,
}: DashboardTopRowProps) {
  const [outstandingOpen, setOutstandingOpen] = useState(false);
  const [leadsOpen, setLeadsOpen] = useState(false);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => {
            setOutstandingOpen((open) => !open);
            setLeadsOpen(false);
          }}
          aria-expanded={outstandingOpen}
          className={`rounded-3xl bg-white p-6 text-left shadow transition hover:shadow-lg ${
            outstandingOpen ? "ring-2 ring-[#d4af37]" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                Outstanding
              </p>
              <h2 className="mt-3 text-4xl font-bold text-[#174734]">{outstandingTotalLabel}</h2>
              <p className="mt-2 text-sm text-[#6b705c]">
                {outstandingCount} unpaid invoice{outstandingCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f7f6f1] text-4xl">
              💸
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#174734]">
            <span>{outstandingOpen ? "Hide invoices" : "See who owes what"}</span>
            <Chevron open={outstandingOpen} />
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setLeadsOpen((open) => !open);
            setOutstandingOpen(false);
          }}
          aria-expanded={leadsOpen}
          className={`rounded-3xl bg-white p-6 text-left shadow transition hover:shadow-lg ${
            leadsOpen ? "ring-2 ring-[#d4af37]" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                Leads
              </p>
              <h2 className="mt-3 text-4xl font-bold text-[#174734]">{leadsCount}</h2>
              <p className="mt-2 text-sm text-[#6b705c]">New this month</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f7f6f1] text-4xl">
              👤
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-[#174734]">
            <span>{leadsOpen ? "Hide leads" : "See recent leads"}</span>
            <Chevron open={leadsOpen} />
          </div>
        </button>

        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                Revenue
              </p>
              <h2 className="mt-3 text-4xl font-bold text-[#174734]">{revenueThisMonthLabel}</h2>
              <p className="mt-2 text-sm text-[#6b705c]">
                {revenueComparisonLabel} vs last month to date
              </p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f7f6f1] text-4xl">
              💰
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">
                New Customers
              </p>
              <h2 className="mt-3 text-4xl font-bold text-[#174734]">{newCustomersThisMonth}</h2>
              <p className="mt-2 text-sm text-[#6b705c]">First invoice this month</p>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f7f6f1] text-4xl">
              🌱
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7a20]">Scans</p>
          <div className="mt-3 flex flex-col">
            <div className="flex items-baseline justify-between py-1.5">
              <span className="text-sm text-[#6b705c]">Today</span>
              <span className="text-xl font-bold text-[#174734]">{scansToday}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-[#ece8dc] py-1.5">
              <span className="text-sm text-[#6b705c]">This Week</span>
              <span className="text-xl font-bold text-[#174734]">{scansWeek}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-[#ece8dc] py-1.5">
              <span className="text-sm text-[#6b705c]">MTD</span>
              <span className="text-xl font-bold text-[#174734]">{scansMtd}</span>
            </div>
          </div>
        </div>
      </section>

      {outstandingOpen && (
        <section className="rounded-3xl bg-white p-6 shadow sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Who owes what</h3>
              <p className="mt-1 text-sm text-[#6b705c]">
                Every unpaid invoice, largest balance first.
              </p>
            </div>
            <p className="text-sm font-bold text-[#174734]">{outstandingTotalLabel} total</p>
          </div>
          <div className="mt-4 flex flex-col">
            {outstandingInvoices.length === 0 ? (
              <p className="py-4 text-sm text-[#6b705c]">Nothing outstanding right now.</p>
            ) : (
              outstandingInvoices.map((invoice) =>
                invoice.customerId ? (
                  <Link
                    key={invoice.id}
                    href={`/customers/${invoice.customerId}`}
                    className="flex items-center justify-between gap-3 border-t border-[#ece8dc] py-3 first:border-t-0 hover:bg-[#f7f6f1]"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[#174734]">{invoice.name}</span>
                      <span className="mt-0.5 text-xs text-[#9c9587]">
                        Invoice {invoice.invoiceNumber}
                      </span>
                    </div>
                    <span className="text-base font-bold text-[#174734]">{invoice.amount}</span>
                  </Link>
                ) : (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between gap-3 border-t border-[#ece8dc] py-3 first:border-t-0"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[#174734]">{invoice.name}</span>
                      <span className="mt-0.5 text-xs text-[#9c9587]">
                        Invoice {invoice.invoiceNumber}
                      </span>
                    </div>
                    <span className="text-base font-bold text-[#174734]">{invoice.amount}</span>
                  </div>
                )
              )
            )}
          </div>
        </section>
      )}

      {leadsOpen && (
        <section className="rounded-3xl bg-white p-6 shadow sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Recent leads</h3>
              <p className="mt-1 text-sm text-[#6b705c]">
                Newest first — {leadsCount} total this month.
              </p>
            </div>
            {leadsMoreCount > 0 && (
              <p className="text-sm font-bold text-[#174734]">+{leadsMoreCount} more this month</p>
            )}
          </div>
          <div className="mt-4 flex flex-col">
            {leadsList.length === 0 ? (
              <p className="py-4 text-sm text-[#6b705c]">No leads yet this month.</p>
            ) : (
              leadsList.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-3 border-t border-[#ece8dc] py-3 first:border-t-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-[#174734]">{lead.name}</span>
                    <span className="mt-0.5 text-xs text-[#9c9587]">{lead.source}</span>
                  </div>
                  <span className="text-sm text-[#6b705c]">{lead.date}</span>
                </div>
              ))
            )}
          </div>
          <Link
            href="/leads"
            className="mt-4 inline-block text-sm font-bold text-[#174734] hover:underline"
          >
            View all in Leads →
          </Link>
        </section>
      )}
    </>
  );
}
