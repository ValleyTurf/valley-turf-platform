"use client";

// Client component for /invoice-test's form. Plain fields, no live math
// needed here (unlike stripe-test's tip calculator) -- this just collects
// what createInvoice() + createCheckoutSession() + sendInvoiceEmail()
// need.
export default function InvoiceForm({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow"
    >
      <div>
        <label htmlFor="customerName" className="block text-sm font-bold">
          Customer name
        </label>
        <input
          id="customerName"
          name="customerName"
          type="text"
          required
          placeholder="Jane Smith"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="customerEmail" className="block text-sm font-bold">
          Customer email
        </label>
        <input
          id="customerEmail"
          name="customerEmail"
          type="email"
          placeholder="jane@example.com"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="customerPhone" className="block text-sm font-bold">
          Customer phone
        </label>
        <input
          id="customerPhone"
          name="customerPhone"
          type="tel"
          placeholder="+14805551234"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-[#9c9990]">
          Fill in email, phone, or both. At least one is required.
        </p>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-bold">
          Description
        </label>
        <input
          id="description"
          name="description"
          type="text"
          required
          placeholder="e.g. Turf cleaning -- 123 Main St"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="amount" className="block text-sm font-bold">
          Amount (USD)
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.50"
          required
          placeholder="150.00"
          className="mt-1 w-full rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
      >
        Create Invoice &amp; Send
      </button>
    </form>
  );
}
