export const dynamic = "force-dynamic";
export const revalidate = 0;

// Find and merge duplicate customers (ROADMAP third top-10 list #8).
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { loadDuplicateReview } from "@/lib/duplicateCustomers";
import {
  describeReasons,
  type DupCustomer,
} from "@/lib/duplicateCustomersLogic";
import { dismissPair, mergeCustomers } from "./actions";
import MergeButton from "./MergeButton";

function CustomerCard({
  customer,
  invoices,
  jobs,
  stillOnJobber,
  suggested,
}: {
  customer: DupCustomer;
  invoices: number;
  jobs: number;
  stillOnJobber: boolean;
  suggested: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#e4dfd0] bg-[#fbfaf6] p-3 text-sm">
      <Link
        href={`/customers/${encodeURIComponent(customer.id)}`}
        className="font-bold text-[#174734] hover:underline"
      >
        {customer.name || "Unnamed customer"}
      </Link>
      {suggested ? (
        <span className="ml-2 rounded-full bg-[#e3f1e8] px-2 py-0.5 text-xs font-bold text-[#1d6b3f]">
          more history
        </span>
      ) : null}
      <div className="mt-1 space-y-0.5 text-[#6b705c]">
        <p>{customer.phone || "No phone"}</p>
        <p className="break-all">{customer.email || "No email"}</p>
        <p>
          {[customer.addressLine1, customer.city].filter(Boolean).join(", ") ||
            "No address"}
        </p>
        <p className="font-semibold text-[#174734]">
          {invoices} {invoices === 1 ? "invoice" : "invoices"}, {jobs}{" "}
          {jobs === 1 ? "job" : "jobs"}
        </p>
        {stillOnJobber ? (
          <p className="font-semibold text-[#a15c07]">Still invoiced in Jobber</p>
        ) : null}
      </div>
    </div>
  );
}

export default async function DuplicateCustomersPage() {
  const [user, review] = await Promise.all([getCurrentUser(), loadDuplicateReview()]);
  const isAdmin = user?.role === "admin";

  return (
    <main className="min-h-screen bg-[#f7f6f1] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/customers"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Customers
        </Link>

        <h1 className="mt-2 text-2xl font-bold text-[#174734]">Duplicate customers</h1>
        <p className="mt-2 max-w-2xl text-[#6b705c]">
          Customers who share a phone, an email, or the same name and address.
          Merging moves every invoice, job, visit, payment, message and saved
          card to the customer you keep, fills in any blank details, and
          removes the other one. A full copy of the removed record is saved.
          {isAdmin ? "" : " Only an admin can merge."}
        </p>

        {review.totalPairs === 0 ? (
          <p className="mt-8 rounded-xl border border-[#b7d9c3] bg-[#eaf5ee] p-4 text-[#1d6b3f]">
            No likely duplicates found.
          </p>
        ) : (
          <p className="mt-4 text-sm text-[#6b705c]">
            {review.totalPairs} possible {review.totalPairs === 1 ? "pair" : "pairs"}
            {review.totalPairs > review.pairs.length
              ? `, showing the first ${review.pairs.length}`
              : ""}
            .
          </p>
        )}

        <div className="mt-4 space-y-4">
          {review.pairs.map((pair) => {
            const keepSide = pair.suggested;
            const keep = keepSide === "a" ? pair.a : pair.b;
            const drop = keepSide === "a" ? pair.b : pair.a;
            const act = (id: string) => review.activity.get(id) ?? { invoices: 0, jobs: 0 };

            return (
              <section
                key={pair.key}
                className="rounded-2xl border border-[#e4dfd0] bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      pair.confidence === "high"
                        ? "bg-[#fdecd4] text-[#a15c07]"
                        : "bg-[#e8ecf3] text-[#475569]"
                    }`}
                  >
                    {pair.confidence === "high" ? "Likely the same" : "Possibly the same"}
                  </span>
                  <span className="text-sm text-[#6b705c]">
                    {describeReasons(pair.reasons)}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <CustomerCard
                    customer={pair.a}
                    invoices={act(pair.a.id).invoices}
                    jobs={act(pair.a.id).jobs}
                    stillOnJobber={review.stillOnJobber.has(pair.a.id)}
                    suggested={keepSide === "a"}
                  />
                  <CustomerCard
                    customer={pair.b}
                    invoices={act(pair.b.id).invoices}
                    jobs={act(pair.b.id).jobs}
                    stillOnJobber={review.stillOnJobber.has(pair.b.id)}
                    suggested={keepSide === "b"}
                  />
                </div>

                {isAdmin ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={mergeCustomers}>
                      <input type="hidden" name="keep" value={keep.id} />
                      <input type="hidden" name="drop" value={drop.id} />
                      <MergeButton
                        label={`Keep ${keep.name || "left"}, merge ${drop.name || "other"} into it`}
                        confirmText={`Merge ${drop.name || "this customer"} into ${keep.name || "the other customer"}? Everything moves to ${keep.name || "the other customer"} and ${drop.name || "this customer"} is removed.`}
                        className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white hover:bg-[#226246]"
                      />
                    </form>

                    <form action={mergeCustomers}>
                      <input type="hidden" name="keep" value={drop.id} />
                      <input type="hidden" name="drop" value={keep.id} />
                      <MergeButton
                        label={`Switch: keep ${drop.name || "other"}`}
                        confirmText={`Merge ${keep.name || "this customer"} into ${drop.name || "the other customer"}? Everything moves to ${drop.name || "the other customer"} and ${keep.name || "this customer"} is removed.`}
                        className="rounded-xl border border-[#d8d3c6] px-4 py-2 text-sm font-bold text-[#174734] hover:border-[#9c7a20]"
                      />
                    </form>

                    <form action={dismissPair}>
                      <input type="hidden" name="a" value={pair.a.id} />
                      <input type="hidden" name="b" value={pair.b.id} />
                      <button
                        type="submit"
                        className="rounded-xl px-3 py-2 text-sm font-semibold text-[#6b705c] hover:underline"
                      >
                        Not the same person
                      </button>
                    </form>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
