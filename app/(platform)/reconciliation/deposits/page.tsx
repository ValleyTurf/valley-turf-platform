export const dynamic = "force-dynamic";
export const revalidate = 0;

// Match Deposits (ROADMAP "Top 10 (November 2026)" #5). Every bank
// deposit nobody has dealt with yet, each with the unpaid invoice(s) it
// most likely pays. One press marks the invoice(s) paid and files the
// deposit -- see lib/depositMatches.ts for exactly what that does, and
// lib/depositMatching.ts for how suggestions are picked (exact amount
// only; a customer's name in the bank's text ranks it first).
//
// Deposits that aren't customer payments at all (a Stripe payout, a
// transfer in) simply have no suggestion here and are still handled
// where they always were, on the Journal page.
import Link from "next/link";
import {
  formatCurrencyPrecise as formatCurrency,
  formatDateOnly as formatDate,
} from "@/lib/format";
import {
  DEPOSIT_PAYMENT_METHODS,
  listDepositsToMatch,
  listInvoicesAwaitingPayment,
} from "@/lib/depositMatches";
import { suggestInvoicesForDeposit, type MatchableInvoice } from "@/lib/depositMatching";
import { matchDeposit } from "./actions";

function guessMethod(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes("zelle")) return "Zelle";
  if (lower.includes("check") || lower.includes("mobile deposit")) return "Check";
  if (lower.includes("cash")) return "Cash";

  return "Zelle";
}

function describeInvoices(ids: string[], byId: Map<string, MatchableInvoice>): string {
  return ids
    .map((id) => byId.get(id))
    .filter((invoice): invoice is MatchableInvoice => Boolean(invoice))
    .map(
      (invoice) =>
        `${invoice.customerName ?? "Unknown customer"} -- ${invoice.invoiceNumber} (${formatCurrency(
          invoice.total
        )})`
    )
    .join(" + ");
}

const selectClasses =
  "rounded-lg border border-[#d9d4c6] bg-white px-2 py-1.5 text-xs outline-none focus:border-[#d4af37]";

function MethodSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="method" defaultValue={defaultValue} className={selectClasses} aria-label="Payment method">
      {DEPOSIT_PAYMENT_METHODS.map((method) => (
        <option key={method} value={method}>
          {method}
        </option>
      ))}
    </select>
  );
}

export default async function MatchDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ matched?: string; error?: string }>;
}) {
  const { matched, error } = await searchParams;

  const [deposits, invoices] = await Promise.all([
    listDepositsToMatch(),
    listInvoicesAwaitingPayment(),
  ]);

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const rows = deposits
    .map((deposit) => ({
      deposit,
      text: `${deposit.vendor ?? ""} ${deposit.description ?? ""}`.trim(),
      suggestions: suggestInvoicesForDeposit(
        {
          amount: deposit.amount,
          text: `${deposit.vendor ?? ""} ${deposit.description ?? ""}`,
        },
        invoices
      ),
    }))
    // Deposits with a suggestion first (best suggestion first), then
    // the rest newest-first as loaded.
    .sort((a, b) => (b.suggestions[0]?.score ?? 0) - (a.suggestions[0]?.score ?? 0));

  const withSuggestion = rows.filter((row) => row.suggestions.length > 0).length;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="/reconciliation" className="text-sm font-semibold text-[#6b705c] hover:underline">
          ← Reconciliation
        </Link>

        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Match Deposits</h1>
        <p className="mt-2 text-sm text-[#6b705c]">
          Bank deposits that haven&apos;t been reviewed yet, next to the unpaid
          invoices they most likely pay. Matching marks the invoice paid
          (nothing is sent to the customer) and files the deposit so it
          isn&apos;t counted as income twice. Suggestions are exact-amount
          matches only.
        </p>

        {matched && (
          <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
            Matched and marked paid: {matched}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <p className="mt-5 text-sm font-semibold">
          {deposits.length} deposit{deposits.length === 1 ? "" : "s"} to review
          {deposits.length > 0 ? ` · ${withSuggestion} with a suggested invoice` : ""} ·{" "}
          {invoices.length} unpaid invoice{invoices.length === 1 ? "" : "s"}
        </p>

        <div className="mt-4 space-y-3">
          {rows.length === 0 && (
            <p className="rounded-2xl bg-white p-6 text-sm text-[#6b705c] shadow">
              Nothing to match. New deposits show up here after the next bank
              feed sync.
            </p>
          )}

          {rows.map(({ deposit, text, suggestions }) => (
            <section key={deposit.id} className="rounded-2xl bg-white p-5 shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold">{text || "Deposit"}</p>
                  <p className="mt-0.5 text-xs text-[#6b705c]">
                    {formatDate(deposit.date)}
                    {deposit.accountLabel ? ` · ${deposit.accountLabel}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold">{formatCurrency(deposit.amount)}</p>
              </div>

              <div className="mt-3 space-y-2 border-t border-[#eee9dc] pt-3">
                {suggestions.length === 0 && (
                  <p className="text-xs text-[#6b705c]">
                    No unpaid invoice for exactly this amount. If it isn&apos;t a
                    customer payment, categorize it on the{" "}
                    <Link href="/expenses/journal" className="font-semibold underline">
                      Journal
                    </Link>{" "}
                    page.
                  </p>
                )}

                {suggestions.map((suggestion) => (
                  <form
                    key={suggestion.invoiceIds.join(",")}
                    action={matchDeposit}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f6f1] px-3 py-2"
                  >
                    <input type="hidden" name="expense_id" value={deposit.id} />
                    <input type="hidden" name="invoice_ids" value={suggestion.invoiceIds.join(",")} />

                    <p className="min-w-0 text-sm">
                      {describeInvoices(suggestion.invoiceIds, invoiceById)}
                      {suggestion.nameMatch && (
                        <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-800">
                          Name matches
                        </span>
                      )}
                    </p>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <MethodSelect defaultValue={guessMethod(text)} />
                      <button
                        type="submit"
                        className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246]"
                      >
                        Match &amp; mark paid
                      </button>
                    </div>
                  </form>
                ))}

                {invoices.length > 0 && (
                  <form action={matchDeposit} className="flex flex-wrap items-center gap-1.5 pt-1">
                    <input type="hidden" name="expense_id" value={deposit.id} />
                    <span className="text-xs text-[#6b705c]">Or pick an invoice:</span>
                    <select
                      name="invoice_ids"
                      required
                      defaultValue=""
                      className={`${selectClasses} max-w-[260px]`}
                      aria-label="Invoice to match"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {invoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.customerName ?? "Unknown"} -- {invoice.invoiceNumber} (
                          {formatCurrency(invoice.total)})
                        </option>
                      ))}
                    </select>
                    <MethodSelect defaultValue={guessMethod(text)} />
                    <button
                      type="submit"
                      className="rounded-lg border border-[#174734] px-3 py-1.5 text-xs font-bold transition hover:bg-[#f7f6f1]"
                    >
                      Match &amp; mark paid
                    </button>
                  </form>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
