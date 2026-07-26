"use client";

import { useMemo, useState } from "react";

export type PickerCustomer = {
  id: string; // customers.jobber_client_id
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type PickerLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type Mode = "customer" | "lead" | "new";

// The only client-interactive piece of the New Quote form — everything
// else on that page is a plain server-rendered form field. This exists
// purely to make "who is this quote for" fast to fill in: pick an
// existing customer or lead from a filtered list (customers/leads are
// loaded once, server-side, and passed in as props — no extra
// round-trip per keystroke) and it fills the name/email/phone fields
// below, still left editable in case the quote needs slightly different
// contact details than what's on file.
export default function QuoteRecipientPicker({
  customers,
  leads,
}: {
  customers: PickerCustomer[];
  leads: PickerLead[];
}) {
  const [mode, setMode] = useState<Mode>("new");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query
      ? customers.filter((c) => c.name.toLowerCase().includes(query))
      : customers;
    return base.slice(0, 25);
  }, [customers, search]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query
      ? leads.filter((l) => l.name.toLowerCase().includes(query))
      : leads;
    return base.slice(0, 25);
  }, [leads, search]);

  function chooseMode(nextMode: Mode) {
    setMode(nextMode);
    setSearch("");
    setSelectedCustomerId(null);
    setSelectedLeadId(null);

    if (nextMode === "new") {
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
    }
  }

  function chooseCustomer(customer: PickerCustomer) {
    setSelectedCustomerId(customer.id);
    setName(customer.name);
    setEmail(customer.email ?? "");
    setPhone(customer.phone ?? "");
    setAddress(customer.address ?? "");
  }

  function chooseLead(lead: PickerLead) {
    setSelectedLeadId(lead.id);
    setName(lead.name);
    setEmail(lead.email ?? "");
    setPhone(lead.phone ?? "");
  }

  const tabClasses = (active: boolean) =>
    `rounded-xl px-4 py-2 text-sm font-bold transition ${
      active
        ? "bg-[#174734] text-white"
        : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
    }`;

  return (
    <div className="space-y-4">
      <input type="hidden" name="customer_id" value={selectedCustomerId ?? ""} />
      <input type="hidden" name="lead_id" value={selectedLeadId ?? ""} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => chooseMode("customer")}
          className={tabClasses(mode === "customer")}
        >
          Existing Customer
        </button>
        <button
          type="button"
          onClick={() => chooseMode("lead")}
          className={tabClasses(mode === "lead")}
        >
          Lead
        </button>
        <button
          type="button"
          onClick={() => chooseMode("new")}
          className={tabClasses(mode === "new")}
        >
          New / Other
        </button>
      </div>

      {(mode === "customer" || mode === "lead") && (
        <div className="rounded-xl border border-[#d8d3c6] bg-[#f7f6f1] p-3">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${mode === "customer" ? "customers" : "leads"} by name…`}
            className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {mode === "customer" &&
              (filteredCustomers.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[#6b705c]">
                  No matching customers.
                </p>
              ) : (
                filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => chooseCustomer(customer)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white ${
                      selectedCustomerId === customer.id
                        ? "bg-white font-bold text-[#174734] ring-1 ring-[#d4af37]"
                        : "text-[#174734]"
                    }`}
                  >
                    {customer.name}
                    {customer.email && (
                      <span className="ml-2 text-xs text-[#6b705c]">
                        {customer.email}
                      </span>
                    )}
                  </button>
                ))
              ))}

            {mode === "lead" &&
              (filteredLeads.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[#6b705c]">
                  No matching leads.
                </p>
              ) : (
                filteredLeads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => chooseLead(lead)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white ${
                      selectedLeadId === lead.id
                        ? "bg-white font-bold text-[#174734] ring-1 ring-[#d4af37]"
                        : "text-[#174734]"
                    }`}
                  >
                    {lead.name}
                    {lead.email && (
                      <span className="ml-2 text-xs text-[#6b705c]">
                        {lead.email}
                      </span>
                    )}
                  </button>
                ))
              ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="recipient_name" className="text-xs font-bold text-[#9c7a20]">
            Name
          </label>
          <input
            id="recipient_name"
            name="recipient_name"
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label htmlFor="recipient_email" className="text-xs font-bold text-[#9c7a20]">
            Email
          </label>
          <input
            id="recipient_email"
            name="recipient_email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label htmlFor="recipient_phone" className="text-xs font-bold text-[#9c7a20]">
            Phone
          </label>
          <input
            id="recipient_phone"
            name="recipient_phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        <div>
          <label htmlFor="recipient_address" className="text-xs font-bold text-[#9c7a20]">
            Address
          </label>
          <input
            id="recipient_address"
            name="recipient_address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>
      </div>
    </div>
  );
}
