export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { jobberGraphQL } from "@/lib/jobber";

type CustomerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type JobberEmail = {
  address: string;
};

type JobberPhone = {
  number: string;
};

type JobberProperty = {
  id: string;
  jobberWebUri: string;
  address: {
    street1: string | null;
    street2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string | null;
  };
};

type JobberJob = {
  id: string;
  jobNumber: number;
  title: string | null;
  jobStatus: string;
  jobType: string;
  total: number;
  startAt: string | null;
  endAt: string | null;
  completedAt: string | null;
  jobberWebUri: string;
};

type JobberQuote = {
  id: string;
  quoteNumber: string;
  title: string | null;
  quoteStatus: string;
  createdAt: string;
  transitionedAt: string;
  jobberWebUri: string;
};

type JobberInvoice = {
  id: string;
  invoiceNumber: string;
  subject: string;
  invoiceStatus: string;
  issuedDate: string | null;
  dueDate: string | null;
  receivedDate: string | null;
  jobberWebUri: string;
};

type JobberClient = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  balance: number | string | null;
  createdAt: string;
  jobberWebUri: string;
  emails: JobberEmail[];
  phones: JobberPhone[];
  clientProperties: {
    nodes: JobberProperty[];
  };
  jobs: {
    nodes: JobberJob[];
  };
  quotes: {
    nodes: JobberQuote[];
  };
  invoices: {
    nodes: JobberInvoice[];
  };
};

async function getJobberClient(id: string): Promise<{
  client: JobberClient | null;
  error: string | null;
}> {
  const result = await jobberGraphQL<{
    client: JobberClient | null;
  }>(
    `
      query GetCustomer($id: EncodedId!) {
        client(id: $id) {
          id
          name
          firstName
          lastName
          companyName
          balance
          createdAt
          jobberWebUri

          emails {
            address
          }

          phones {
            number
          }

          clientProperties(first: 10) {
            nodes {
              id
              jobberWebUri
              address {
                street1
                street2
                city
                province
                postalCode
                country
              }
            }
          }

          jobs(first: 10) {
            nodes {
              id
              jobNumber
              title
              jobStatus
              jobType
              total
              startAt
              endAt
              completedAt
              jobberWebUri
            }
          }

          quotes(first: 10) {
            nodes {
              id
              quoteNumber
              title
              quoteStatus
              createdAt
              transitionedAt
              jobberWebUri
            }
          }

          invoices(first: 10) {
            nodes {
              id
              invoiceNumber
              subject
              invoiceStatus
              issuedDate
              dueDate
              receivedDate
              jobberWebUri
            }
          }
        }
      }
    `,
    { id }
  );

  return {
    client: result.data?.client ?? null,
    error:
      result.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join(", ") ?? null,
  };
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  const normalized =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits;

  if (normalized.length !== 10) {
    return phone;
  }

  return `(${normalized.slice(0, 3)}) ${normalized.slice(
    3,
    6
  )}-${normalized.slice(6)}`;
}

function formatCurrency(value: number | string | null): string {
  const amount = Number(value ?? 0);

  if (Number.isNaN(amount)) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAddress(property: JobberProperty): string {
  const address = property.address;

  const street = [address.street1, address.street2]
    .filter(Boolean)
    .join(" ");

  const cityState = [address.city, address.province]
    .filter(Boolean)
    .join(", ");

  return [street, cityState, address.postalCode, address.country]
    .filter(Boolean)
    .join(" ");
}

function statusClasses(status: string): string {
  const normalized = status.toUpperCase();

  if (
    normalized.includes("PAID") ||
    normalized.includes("APPROVED") ||
    normalized.includes("COMPLETED") ||
    normalized.includes("ACTIVE")
  ) {
    return "bg-green-100 text-green-800";
  }

  if (
    normalized.includes("DRAFT") ||
    normalized.includes("PENDING") ||
    normalized.includes("AWAITING")
  ) {
    return "bg-yellow-100 text-yellow-800";
  }

  if (
    normalized.includes("CANCEL") ||
    normalized.includes("DECLINED") ||
    normalized.includes("OVERDUE")
  ) {
    return "bg-red-100 text-red-800";
  }

  return "bg-gray-100 text-gray-700";
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const { client, error } = await getJobberClient(decodedId);

  if (!client) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-3xl bg-white p-8 shadow">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Customer Profile
            </p>

            <h1 className="mt-3 text-3xl font-bold">
              Customer could not be loaded
            </h1>

            <p className="mt-4 text-[#6b705c]">
              {error ?? "No customer information was returned by Jobber."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/customers"
                className="rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white"
              >
                Back to Customers
              </Link>

              <Link
                href="/api/jobber/connect"
                className="rounded-xl border border-[#174734] px-5 py-3 text-sm font-bold"
              >
                Reconnect Jobber
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const email = client.emails?.[0]?.address ?? null;
  const phone = client.phones?.[0]?.number ?? null;
  const properties = client.clientProperties?.nodes ?? [];
  const jobs = client.jobs?.nodes ?? [];
  const quotes = client.quotes?.nodes ?? [];
  const invoices = client.invoices?.nodes ?? [];

  const jobRevenue = jobs.reduce(
    (total, job) => total + Number(job.total ?? 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Customer Profile
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {client.name || "Unnamed Customer"}
            </h1>

            {client.companyName && (
              <p className="mt-2 text-lg text-[#6b705c]">
                {client.companyName}
              </p>
            )}

            <p className="mt-2 text-sm text-[#6b705c]">
              Customer since {formatDate(client.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={client.jobberWebUri}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734]"
            >
              Open in Jobber
            </a>

            <Link
              href="/customers"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white"
            >
              Back to Customers
            </Link>
          </div>
        </header>

        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm text-[#6b705c]">Current Balance</p>
            <p className="mt-2 text-3xl font-bold">
              {formatCurrency(client.balance)}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm text-[#6b705c]">Recent Jobs</p>
            <p className="mt-2 text-3xl font-bold">{jobs.length}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm text-[#6b705c]">Recent Quotes</p>
            <p className="mt-2 text-3xl font-bold">{quotes.length}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm text-[#6b705c]">
              Value of Jobs Shown
            </p>
            <p className="mt-2 text-3xl font-bold">
              {formatCurrency(jobRevenue)}
            </p>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Contact Information</h2>

              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-sm font-bold text-[#9c7a20]">Email</p>

                  {email ? (
                    <a
                      href={`mailto:${email}`}
                      className="mt-1 block break-words text-lg font-semibold hover:underline"
                    >
                      {email}
                    </a>
                  ) : (
                    <p className="mt-1 text-[#6b705c]">No email</p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-bold text-[#9c7a20]">Phone</p>

                  {phone ? (
                    <a
                      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                      className="mt-1 block text-lg font-semibold hover:underline"
                    >
                      {formatPhone(phone)}
                    </a>
                  ) : (
                    <p className="mt-1 text-[#6b705c]">No phone</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Properties</h2>

              <div className="mt-6 space-y-4">
                {properties.length > 0 ? (
                  properties.map((property) => (
                    <a
                      key={property.id}
                      href={property.jobberWebUri}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl bg-[#f7f6f1] p-5 transition hover:bg-[#efeadf]"
                    >
                      <p className="font-semibold">
                        {formatAddress(property) || "Address unavailable"}
                      </p>

                      <p className="mt-2 text-sm text-[#9c7a20]">
                        Open property in Jobber →
                      </p>
                    </a>
                  ))
                ) : (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No properties found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Marketing Attribution</h2>

              <div className="mt-6 rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                QR campaign, first scan, lead source, and campaign revenue will
                be connected here next.
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Recent Jobs</h2>

              <div className="mt-6 space-y-4">
                {jobs.length > 0 ? (
                  jobs.map((job) => (
                    <a
                      key={job.id}
                      href={job.jobberWebUri}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold">
                            Job #{job.jobNumber}
                            {job.title ? ` — ${job.title}` : ""}
                          </p>

                          <p className="mt-2 text-sm text-[#6b705c]">
                            {formatDate(job.startAt)}
                          </p>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
                            job.jobStatus
                          )}`}
                        >
                          {formatStatus(job.jobStatus)}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-sm text-[#6b705c]">
                          {formatStatus(job.jobType)}
                        </p>

                        <p className="font-bold">
                          {formatCurrency(job.total)}
                        </p>
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No jobs found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Recent Quotes</h2>

              <div className="mt-6 space-y-4">
                {quotes.length > 0 ? (
                  quotes.map((quote) => (
                    <a
                      key={quote.id}
                      href={quote.jobberWebUri}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold">
                            Quote #{quote.quoteNumber}
                          </p>

                          <p className="mt-1 text-[#6b705c]">
                            {quote.title || "No title"}
                          </p>

                          <p className="mt-2 text-sm text-[#6b705c]">
                            Created {formatDate(quote.createdAt)}
                          </p>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
                            quote.quoteStatus
                          )}`}
                        >
                          {formatStatus(quote.quoteStatus)}
                        </span>
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No quotes found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-8 shadow">
              <h2 className="text-2xl font-bold">Recent Invoices</h2>

              <div className="mt-6 space-y-4">
                {invoices.length > 0 ? (
                  invoices.map((invoice) => (
                    <a
                      key={invoice.id}
                      href={invoice.jobberWebUri}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-[#e7e2d5] p-5 transition hover:border-[#d4af37]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold">
                            Invoice #{invoice.invoiceNumber}
                          </p>

                          <p className="mt-1 text-[#6b705c]">
                            {invoice.subject || "No subject"}
                          </p>

                          <p className="mt-2 text-sm text-[#6b705c]">
                            Issued {formatDate(invoice.issuedDate)}
                          </p>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
                            invoice.invoiceStatus
                          )}`}
                        >
                          {formatStatus(invoice.invoiceStatus)}
                        </span>
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="rounded-2xl bg-[#f7f6f1] p-5 text-[#6b705c]">
                    No invoices found.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}