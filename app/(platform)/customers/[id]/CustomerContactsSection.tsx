"use client";

// Ryan (2026-09-17): merged what used to be two separate cards --
// Contact Information (email/phone/balance/properties, still rendered
// as a server-rendered block until this file took it over) and this
// file's own standalone "Additional Contacts" section -- into one.
// "+ Add Contact" and the new "+ Add Address" now live in the header up
// top; the resulting lists render down near the property address list,
// per Ryan's own suggested layout. File keeps its original name
// (CustomerContactsSection.tsx) to avoid an orphaned file/import churn,
// but it now owns the whole Contact Information card -- see
// page.tsx's single <CustomerContactsSection ... /> call, which
// replaced both the old inline JSX and the old separate component call.
//
// A client component (not plain <form action>s throughout) for the same
// reason InvoiceCard.tsx is: add/delete/toggle each need inline error
// feedback without a full page reload, called via useTransition. The
// existing "Set current property" forms are plain bound server actions
// though (setCurrentProperty) -- those still work fine invoked from a
// client component, so that part is carried over unchanged rather than
// rebuilt as client state.
import { useState, useTransition } from "react";
import {
  addCustomerContact,
  deleteCustomerContact,
  toggleCustomerContactNotifications,
  addCustomerAddress,
  deleteCustomerAddress,
  setCurrentProperty,
} from "./actions";
import { formatCurrency } from "@/lib/format";

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

// Structurally the same as lib/customerAddresses.ts's CustomerAddress --
// declared separately here so this client file has no server-only
// import, same reasoning as AdditionalContact above.
export type AdditionalAddress = {
  id: string;
  jobberClientId: string;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: string;
};

type JobberPropertyAddress = {
  street1: string | null;
  street2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
};

type JobberProperty = {
  id: string;
  jobberWebUri: string | null;
  address: JobberPropertyAddress | null;
};

// Same formatter page.tsx used to own for this block.
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  const normalized =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (normalized.length !== 10) {
    return phone;
  }

  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function formatPropertyAddress(property: JobberProperty): string {
  const address = property.address;

  if (!address) {
    return "Address unavailable";
  }

  const street = [address.street1, address.street2].filter(Boolean).join(" ");
  const cityState = [address.city, address.province].filter(Boolean).join(", ");

  // Matches page.tsx's original formatAddress exactly (space-joined,
  // not comma-joined, for this final line) -- carried over as-is rather
  // than "fixed" as a side effect of this refactor.
  return [street, cityState, address.postalCode, address.country]
    .filter(Boolean)
    .join(" ");
}

function formatCustomAddress(address: AdditionalAddress): string {
  const street = [address.addressLine1, address.addressLine2]
    .filter(Boolean)
    .join(" ");
  const cityState = [address.city, address.state].filter(Boolean).join(", ");

  return (
    [street, cityState, address.postalCode].filter(Boolean).join(", ") ||
    "Address unavailable"
  );
}

export default function CustomerContactsSection({
  jobberClientId,
  email,
  phone,
  lifetimeCollected,
  properties,
  currentPropertyId,
  contacts,
  addresses,
}: {
  jobberClientId: string;
  email: string | null;
  phone: string | null;
  lifetimeCollected: number;
  properties: JobberProperty[];
  currentPropertyId: string | null;
  contacts: AdditionalContact[];
  addresses: AdditionalAddress[];
}) {
  const [isPending, startTransition] = useTransition();

  const [addingContact, setAddingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [receivesNotifications, setReceivesNotifications] = useState(false);

  const [addingAddress, setAddingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressLabel, setAddressLabel] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");

  function resetContactForm() {
    setLabel("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setReceivesNotifications(false);
    setAddingContact(false);
  }

  function handleAddContact() {
    setContactError(null);

    if (!contactEmail.trim() && !contactPhone.trim()) {
      setContactError("Enter at least an email or a phone number.");
      return;
    }

    startTransition(async () => {
      const result = await addCustomerContact(jobberClientId, {
        label: label.trim() || null,
        contactName: contactName.trim() || null,
        email: contactEmail.trim() || null,
        phone: contactPhone.trim() || null,
        receivesNotifications,
      });

      if (result.error) {
        setContactError(result.error);
        return;
      }

      resetContactForm();
    });
  }

  function handleToggleContact(contact: AdditionalContact, next: boolean) {
    setContactError(null);
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
        setContactError(result.error);
      }
    });
  }

  function handleDeleteContact(contactId: string) {
    setContactError(null);
    startTransition(async () => {
      const result = await deleteCustomerContact(jobberClientId, contactId);

      if (result.error) {
        setContactError(result.error);
      }
    });
  }

  function resetAddressForm() {
    setAddressLabel("");
    setAddressLine1("");
    setAddressLine2("");
    setAddressCity("");
    setAddressState("");
    setAddressPostalCode("");
    setAddingAddress(false);
  }

  function handleAddAddress() {
    setAddressError(null);

    if (!addressLine1.trim()) {
      setAddressError("Enter a street address.");
      return;
    }

    startTransition(async () => {
      const result = await addCustomerAddress(jobberClientId, {
        label: addressLabel.trim() || null,
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || null,
        city: addressCity.trim() || null,
        state: addressState.trim() || null,
        postalCode: addressPostalCode.trim() || null,
      });

      if (result.error) {
        setAddressError(result.error);
        return;
      }

      resetAddressForm();
    });
  }

  function handleDeleteAddress(addressId: string) {
    setAddressError(null);
    startTransition(async () => {
      const result = await deleteCustomerAddress(jobberClientId, addressId);

      if (result.error) {
        setAddressError(result.error);
      }
    });
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Contact Information</h2>

        <div className="flex flex-wrap gap-2">
          {!addingContact && (
            <button
              type="button"
              onClick={() => setAddingContact(true)}
              className="rounded-xl border border-[#174734] px-3 py-1.5 text-xs font-bold transition hover:bg-[#f7f6f1]"
            >
              + Add Contact
            </button>
          )}
          {!addingAddress && (
            <button
              type="button"
              onClick={() => setAddingAddress(true)}
              className="rounded-xl border border-[#174734] px-3 py-1.5 text-xs font-bold transition hover:bg-[#f7f6f1]"
            >
              + Add Address
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-[#9c7a20]">Email</p>

            {email ? (
              <a
                href={`mailto:${email}`}
                className="mt-0.5 block break-words text-sm font-semibold hover:underline"
              >
                {email}
              </a>
            ) : (
              <p className="mt-0.5 text-sm text-[#6b705c]">No email</p>
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-[#9c7a20]">Phone</p>

            {phone ? (
              <a
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="mt-0.5 block text-sm font-semibold hover:underline"
              >
                {formatPhone(phone)}
              </a>
            ) : (
              <p className="mt-0.5 text-sm text-[#6b705c]">No phone</p>
            )}
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-xs font-bold text-[#9c7a20]">Lifetime Collected</p>

          <p className="mt-0.5 text-2xl font-bold">
            {formatCurrency(lifetimeCollected)}
          </p>
        </div>
      </div>

      {addingContact && (
        <div className="mt-4 space-y-2 rounded-xl border border-[#e7e2d5] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            New Contact
          </p>

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
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Email"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
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

          {contactError && (
            <p className="text-xs font-semibold text-red-600">{contactError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleAddContact}
              className="flex-1 rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save Contact"}
            </button>
            <button
              type="button"
              onClick={resetContactForm}
              className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {addingAddress && (
        <div className="mt-4 space-y-2 rounded-xl border border-[#e7e2d5] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            New Address
          </p>

          <input
            type="text"
            value={addressLabel}
            onChange={(e) => setAddressLabel(e.target.value)}
            placeholder="Label (e.g. Rental Property, Billing Address)"
            className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          <input
            type="text"
            value={addressLine1}
            onChange={(e) => setAddressLine1(e.target.value)}
            placeholder="Street address"
            className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          <input
            type="text"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="Apt / Suite (optional)"
            className="w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={addressCity}
              onChange={(e) => setAddressCity(e.target.value)}
              placeholder="City"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <input
              type="text"
              value={addressState}
              onChange={(e) => setAddressState(e.target.value)}
              placeholder="State"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
            <input
              type="text"
              value={addressPostalCode}
              onChange={(e) => setAddressPostalCode(e.target.value)}
              placeholder="ZIP"
              className="rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </div>

          {addressError && (
            <p className="text-xs font-semibold text-red-600">{addressError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleAddAddress}
              className="flex-1 rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save Address"}
            </button>
            <button
              type="button"
              onClick={resetAddressForm}
              className="rounded-xl border border-[#d9d4c6] px-4 py-2 text-sm font-bold transition hover:bg-[#f7f6f1]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2 border-t border-[#e7e2d5] pt-4">
        {(properties.length > 1 || addresses.length > 0) && properties.length > 0 && (
          <p className="text-xs text-[#6b705c]">
            This customer has multiple properties on file. Mark which one
            is current so the customer card and directions use the right
            address.
          </p>
        )}

        {properties.length === 0 && addresses.length === 0 ? (
          <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
            No properties found.
          </p>
        ) : (
          <>
            {properties.map((property) => {
              // Jobber has no "primary property" concept, so when no
              // manual override is saved yet, the first property is the
              // one actually used (see getCustomerAddress in
              // lib/jobberWebhookProcessor.ts) -- this mirrors that
              // default so the badge always matches reality.
              const isCurrent = currentPropertyId
                ? property.id === currentPropertyId
                : property.id === properties[0]?.id;

              const content = (
                <p className="text-sm font-semibold">
                  {formatPropertyAddress(property)}
                </p>
              );

              // Opens Google Maps for the address instead of the Jobber
              // property page -- Ryan wants a quick way to pull up
              // directions, not the Jobber record. Only linked when
              // there's a real address to search for (formatPropertyAddress
              // falls back to "Address unavailable" otherwise, which isn't
              // worth sending to Maps).
              const mapsUrl = property.address
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    formatPropertyAddress(property)
                  )}`
                : null;

              const addressBlock = mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block min-w-0 flex-1 hover:underline"
                >
                  {content}
                </a>
              ) : (
                <div className="min-w-0 flex-1">{content}</div>
              );

              return (
                <div
                  key={property.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f6f1] px-3 py-2 transition hover:bg-[#efeadf]"
                >
                  {addressBlock}

                  {properties.length > 1 &&
                    (isCurrent ? (
                      <span className="shrink-0 rounded-full bg-[#174734] px-2 py-0.5 text-[10px] font-bold text-white">
                        Current
                      </span>
                    ) : (
                      <form
                        action={setCurrentProperty.bind(
                          null,
                          jobberClientId,
                          property.id
                        )}
                      >
                        <button
                          type="submit"
                          className="shrink-0 rounded-full border border-[#174734] px-2 py-0.5 text-[10px] font-bold text-[#174734] transition hover:bg-[#174734] hover:text-white"
                        >
                          Set current
                        </button>
                      </form>
                    ))}
                </div>
              );
            })}

            {addresses.map((address) => (
              <div
                key={address.id}
                className="flex items-start justify-between gap-3 rounded-xl bg-[#f7f6f1] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {formatCustomAddress(address)}
                  </p>
                  {address.label && (
                    <span className="mt-1 inline-block rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-bold text-[#6b705c]">
                      {address.label}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDeleteAddress(address.id)}
                  aria-label="Remove address"
                  className="shrink-0 rounded-lg px-2 text-lg font-bold text-[#9c7a20] hover:bg-[#f7f6f1] disabled:opacity-60"
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}

        {addressError && !addingAddress && (
          <p className="text-xs font-semibold text-red-600">{addressError}</p>
        )}
      </div>

      <div className="mt-5 space-y-2 border-t border-[#e7e2d5] pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
          Additional Contacts
        </p>
        <p className="text-xs text-[#6b705c]">
          For a second cell number, a spouse, or a property manager — the
          main Email/Phone above stay the ones every automated message
          uses unless you turn on &quot;Also send messages&quot; for one
          of these.
        </p>

        {contacts.length === 0 ? (
          <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
            No additional contacts yet.
          </p>
        ) : (
          contacts.map((contact) => (
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
                  onClick={() => handleDeleteContact(contact.id)}
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
                  onChange={(e) => handleToggleContact(contact, e.target.checked)}
                  className="h-4 w-4 rounded border-[#d8d3c6] text-[#174734] focus:ring-2 focus:ring-[#d4af37]/40"
                />
                Also send invoice/reminder/on-my-way messages here
              </label>
            </div>
          ))
        )}

        {contactError && !addingContact && (
          <p className="text-xs font-semibold text-red-600">{contactError}</p>
        )}
      </div>
    </section>
  );
}
