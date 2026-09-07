"use client";

// Additional emails/phones for a customer, beyond the single primary
// pair shown in Contact Information above -- see migration
// 060_add_customer_contacts.sql for the full reasoning. A client
// component (not a plain <form action>) for the same reason
// InvoiceCard.tsx is: add/delete/toggle each need inline error feedback
// without a full page reload, called via useTransition.
import { useState, useTransition } from "react";
import {
  addCustomerContact,
  deleteCustomerContact,
  toggleCustomerContactNotifications,
} from "./actions";

export type AdditionalContact = {
  id: string;
  jobberClientId: string;
  label: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  receivesNotifications: boolean;
  createdAt: string;
};

export default function CustomerContactsSection({
  jobberClientId,
  contacts,
}: {
  jobberClientId: string;
  contacts: AdditionalContact[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [label, setLabel] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [receivesNotifications, setReceivesNotifications] = useState(false);

  function resetForm() {
    setLabel("");
    setContactName("");
    setEmail("");
    setPhone("");
    setReceivesNotifications(false);
    setAdding(false);
  }

  function handleAdd() {
    setError(null);

    if (!email.trim() && !phone.trim()) {
      setError("Enter at least an email or a phone number.");
      return;
    }

    startTransition(async () => {
      const result = await addCustomerContact(jobberClientId, {
        label: label.trim() || null,
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        receivesNotifications,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      resetForm();
    });
  }

  function handleToggle(contact: AdditionalContact, next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleCustomerContactNotifications(
        jobberClientId,
        contact.id,
        {
          label: contact.label,
          contactName: contact.contactName,
          email: contact.email,
          phone: contact.phone,
        },
        next
      );

      if (result.error) {
        setError(result.error);
      }
    });
  }

  function handleDelete(contactId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteCustomerContact(jobberClientId, contactId);

      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Additional Contacts</h2>

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-xl border border-[#174734] px-3 py-1.5 text-xs font-bold transition hover:bg-[#f7f6f1]"
          >
            + Add Contact
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-[#6b705c]">
        For a second cell number, a spouse, or a property manager — the
        main Email/Phone above stay the ones every automated message uses
        unless you turn on &quot;Also send messages&quot; for one of these.
      </p>

      {contacts.length === 0 && !adding && (
        <p className="mt-3 text-sm text-[#6b705c]">No additional contacts yet.</p>
      )}

      {contacts.length > 0 && (
        <div className="mt-3 space-y-2">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="rounded-xl border border-[#e7e2d5] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {contact.contactName || "—"}
                    {contact.label ? (
                      <span className="ml-2 rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-bold text-[#6b705c]">
                        {contact.label}
                      </span>
                    ) : null}
                  </p>

                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="mt-0.5 block break-words text-xs font-semibold hover:underline"
                    >
                      {contact.email}
                    </a>
                  )}

                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                      className="mt-0.5 block text-xs font-semibold hover:underline"
                    >
                      {contact.phone}
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(contact.id)}
                  aria-label="Remove contact"
                  className="shrink-0 rounded-lg px-2 text-lg font-bold text-[#9c7a20] hover:bg-[#f7f6f1] disabled:opacity-60"
                >
                  ×
                </button>
              </div>

              <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#6b705c]">
                <input
                  type="checkbox"
                  checked={contact.receivesNotifications}
                  disabled={isPending}
                  onChange={(e) => handleToggle(contact, e.target.checked)}
                  className="h-4 w-4 rounded border-[#d8d3c6] text-[#174734] focus:ring-2 focus:ring-[#d4af37]/40"
                />
                Also send invoice/reminder/on-my-way messages here
              </label>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl border border-[#e7e2d5] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Name (if different than customer)"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Cell, Property Manager)"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#6b705c]">
            <input
              type="checkbox"
              checked={receivesNotifications}
              onChange={(e) => setReceivesNotifications(e.target.checked)}
              className="h-4 w-4 rounded border-[#d8d3c6] text-[#174734] focus:ring-2 focus:ring-[#d4af37]/40"
            />
            Also send invoice/reminder/on-my-way messages here
          </label>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleAdd}
              className="flex-1 rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save Contact"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!adding && error && (
        <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
      )}
    </section>
  );
}
