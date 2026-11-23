export const dynamic = "force-dynamic";
export const revalidate = 0;

// "My Info": the customer's own email and phone, extra contacts (a spouse,
// a property manager) and their service address (read-only; changing where
// we service goes through us).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { getPortalAccount, listContactsForCustomer } from "@/lib/portalAccount";
import { CONTACT_ERROR_TEXT, CONTACT_OK_TEXT } from "@/lib/portalContactLogic";
import { PortalShell } from "../PortalShell";
import { addExtraContact, removeExtraContact, savePrimaryContact } from "./actions";

const INPUT =
  "mt-1 block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20";
const LABEL = "text-sm font-semibold text-[#6b705c]";

export default async function PortalAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    redirect("/portal/login");
  }

  const { result } = await searchParams;
  const [account, contacts] = await Promise.all([
    getPortalAccount(customer.jobberClientId),
    listContactsForCustomer(customer.jobberClientId),
  ]);

  const okText = result ? CONTACT_OK_TEXT[result] : undefined;
  const errorText = result && !okText ? CONTACT_ERROR_TEXT[result] : undefined;

  return (
    <PortalShell activeHref="/portal/account" customerName={customer.name}>
      {okText && (
        <p className="mb-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">{okText}</p>
      )}
      {errorText && (
        <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{errorText}</p>
      )}

      <section className="rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Your contact info</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          This is where we send reminders, invoices and receipts, and where your sign-in links go.
        </p>

        <form action={savePrimaryContact} className="mt-5 space-y-4">
          <div>
            <label htmlFor="email" className={LABEL}>
              Email address
            </label>
            <input id="email" name="email" type="email" defaultValue={account.email ?? ""} className={INPUT} />
          </div>
          <div>
            <label htmlFor="phone" className={LABEL}>
              Mobile phone
            </label>
            <input id="phone" name="phone" type="tel" defaultValue={account.phone ?? ""} className={INPUT} />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Save changes
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Other contacts</h2>
        <p className="mt-1 text-sm text-[#6b705c]">
          Add someone else we can reach, like a spouse or a property manager. Tick the box if they
          should also get your reminders and invoices.
        </p>

        {contacts.length > 0 && (
          <ul className="mt-4 space-y-3">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e7e2d5] p-4"
              >
                <div className="text-sm">
                  <p className="font-bold">
                    {contact.contactName || "Contact"}
                    {contact.label ? ` (${contact.label})` : ""}
                  </p>
                  <p className="text-[#6b705c]">
                    {[contact.phone, contact.email].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs text-[#6b705c]">
                    {contact.receivesNotifications
                      ? "Also gets reminders and invoices"
                      : "Not sent reminders or invoices"}
                  </p>
                </div>
                <form action={removeExtraContact}>
                  <input type="hidden" name="contact_id" value={contact.id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-bold text-[#6b705c] transition hover:border-red-300"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addExtraContact} className="mt-5 space-y-4 rounded-2xl bg-[#f7f6f1] p-4">
          <p className="text-sm font-bold">Add a contact</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="c-name" className={LABEL}>
                Name
              </label>
              <input id="c-name" name="name" type="text" className={INPUT} />
            </div>
            <div>
              <label htmlFor="c-label" className={LABEL}>
                Who they are (optional)
              </label>
              <input id="c-label" name="label" type="text" placeholder="Spouse, property manager..." className={INPUT} />
            </div>
            <div>
              <label htmlFor="c-phone" className={LABEL}>
                Phone
              </label>
              <input id="c-phone" name="phone" type="tel" className={INPUT} />
            </div>
            <div>
              <label htmlFor="c-email" className={LABEL}>
                Email
              </label>
              <input id="c-email" name="email" type="email" className={INPUT} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="receives_notifications" className="h-4 w-4" />
            Also send them my reminders and invoices
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Add contact
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Service address</h2>
        <p className="mt-2 text-sm">{account.address ?? "No address on file."}</p>
        <p className="mt-2 text-sm text-[#6b705c]">
          Moved, or need us at a different address?{" "}
          <Link href="/portal/messages" className="font-semibold text-[#9c7a20] hover:underline">
            Send us a message
          </Link>{" "}
          and we&apos;ll update it.
        </p>
      </section>
    </PortalShell>
  );
}
