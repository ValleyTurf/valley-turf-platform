export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { jobberGraphQL } from "@/lib/jobber";
import { supabaseServer } from "@/lib/supabase-server";
import { updateCustomerProfile } from "./actions";
import { saveVisitCosts } from "../../materials/actions";

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
  jobberWebUri: string | null;
  address: {
    street1: string | null;
    street2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
};

type JobberJob = {
  id: string;
  jobNumber: number | string | null;
  title: string | null;
  jobStatus: string | null;
  jobType: string | null;
  total: number | string | null;
  startAt: string | null;
  endAt: string | null;
  completedAt: string | null;
  jobberWebUri: string | null;
};

type JobberQuote = {
  id: string;
  quoteNumber: string | number | null;
  title: string | null;
  quoteStatus: string | null;
  createdAt: string | null;
  transitionedAt: string | null;
  jobberWebUri: string | null;
};

type JobberInvoice = {
  id: string;
  invoiceNumber: string | number | null;
  subject: string | null;
  invoiceStatus: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  receivedDate: string | null;
  total: number | string | null;
  jobberWebUri: string | null;
};

type JobberClient = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  balance: number | string | null;
  createdAt: string | null;
  jobberWebUri: string | null;
  emails: JobberEmail[];
  phones: JobberPhone[];

  clientProperties: {
    nodes: JobberProperty[];
  } | null;

  jobs: {
    nodes: JobberJob[];
  } | null;

  quotes: {
    nodes: JobberQuote[];
  } | null;

  invoices: {
    nodes: JobberInvoice[];
  } | null;
};

type CustomerFinancials = {
  jobber_client_id: string;
  customer_name: string | null;
  invoice_count: number | string | null;
  lifetime_invoiced: number | string | null;
  lifetime_collected: number | string | null;
  outstanding_balance: number | string | null;
  average_invoice: number | string | null;
  first_invoice_date: string | null;
  latest_invoice_date: string | null;
};

type CustomerProfitSummary = {
  total_revenue: number | string | null;
  total_direct_cost: number | string | null;
  total_overhead_allocated: number | string | null;
  total_estimated_profit: number | string | null;
};

type InvoiceCostBreakdown = {
  jobber_invoice_id: string;
  direct_cost: number | string;
  overhead_allocated: number | string;
  estimated_profit: number | string;
};

type MaterialOption = {
  id: string;
  name: string;
  unit_label: string;
};

type EquipmentOption = {
  id: string;
  name: string;
};

type CustomerVisit = {
  jobber_visit_id: string;
  title: string | null;
  visit_status: string | null;
  start_at: string | null;
  completed_at: string | null;
};

type VisitUsageRow = {
  jobber_visit_id: string;
  material_id: string;
  quantity_used: number | string;
};

type VisitEquipmentUsageRow = {
  jobber_visit_id: string;
  equipment_id: string;
};

type VisitCost = {
  jobber_visit_id: string;
  material_cost: number | string;
};

async function getMaterialsList(): Promise<MaterialOption[]> {
  const { data, error } = await supabaseServer
    .from("materials")
    .select("id, name, unit_label")
    .order("name", { ascending: true });

  if (error) {
    console.error("Materials query failed:", error.message);
    return [];
  }

  return (data ?? []) as MaterialOption[];
}

async function getEquipmentList(): Promise<EquipmentOption[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseServer
    .from("equipment")
    .select("id, name")
    .or(`retired_date.is.null,retired_date.gt.${today}`)
    .order("name", { ascending: true });

  if (error) {
    console.error("Equipment query failed:", error.message);
    return [];
  }

  return (data ?? []) as EquipmentOption[];
}

async function getPastVisits(
  jobberClientId: string
): Promise<CustomerVisit[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, title, visit_status, start_at, completed_at")
    .eq("jobber_client_id", jobberClientId)
    .not("start_at", "is", null)
    .lt("start_at", nowIso)
    .order("start_at", { ascending: false });

  if (error) {
    console.error("Past visits query failed:", error.message);
    return [];
  }

  return (data ?? []) as CustomerVisit[];
}

async function getNextVisit(
  jobberClientId: string
): Promise<CustomerVisit | null> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from("jobber_visits")
    .select("jobber_visit_id, title, visit_status, start_at, completed_at")
    .eq("jobber_client_id", jobberClientId)
    .not("start_at", "is", null)
    .gte("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Next visit query failed:", error.message);
    return null;
  }

  return (data as CustomerVisit | null) ?? null;
}

async function getVisitUsageMaps(visitIds: string[]): Promise<{
  usageMap: Map<string, number>;
  equipmentUsageSet: Set<string>;
  costMap: Map<string, number>;
}> {
  if (visitIds.length === 0) {
    return {
      usageMap: new Map(),
      equipmentUsageSet: new Set(),
      costMap: new Map(),
    };
  }

  const [usageResult, equipmentUsageResult, costResult] = await Promise.all([
    supabaseServer
      .from("visit_material_usage")
      .select("jobber_visit_id, material_id, quantity_used")
      .in("jobber_visit_id", visitIds),
    supabaseServer
      .from("visit_equipment_usage")
      .select("jobber_visit_id, equipment_id")
      .in("jobber_visit_id", visitIds),
    supabaseServer
      .from("visit_material_cost")
      .select("jobber_visit_id, material_cost")
      .in("jobber_visit_id", visitIds),
  ]);

  const usageMap = new Map<string, number>();
  for (const row of (usageResult.data ?? []) as VisitUsageRow[]) {
    usageMap.set(
      `${row.jobber_visit_id}:${row.material_id}`,
      Number(row.quantity_used ?? 0)
    );
  }

  const equipmentUsageSet = new Set<string>();
  for (const row of (equipmentUsageResult.data ??
    []) as VisitEquipmentUsageRow[]) {
    equipmentUsageSet.add(`${row.jobber_visit_id}:${row.equipment_id}`);
  }

  const costMap = new Map<string, number>();
  for (const row of (costResult.data ?? []) as VisitCost[]) {
    costMap.set(row.jobber_visit_id, Number(row.material_cost ?? 0));
  }

  return { usageMap, equipmentUsageSet, costMap };
}

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
              total
              jobberWebUri
            }
          }
        }
      }
    `,
    {
      id,
    }
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

async function getCustomerFinancials(
  jobberClientId: string
): Promise<CustomerFinancials | null> {
  const { data, error } = await supabaseServer
    .from("customer_financials")
    .select(
      `
        jobber_client_id,
        customer_name,
        invoice_count,
        lifetime_invoiced,
        lifetime_collected,
        outstanding_balance,
        average_invoice,
        first_invoice_date,
        latest_invoice_date
      `
    )
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (error) {
    console.error("Customer financial query failed:", error.message);
    return null;
  }

  return data as CustomerFinancials | null;
}

async function getCustomerProfitSummary(
  jobberClientId: string
): Promise<CustomerProfitSummary | null> {
  const { data, error } = await supabaseServer
    .from("customer_profit_summary")
    .select(
      "total_revenue, total_direct_cost, total_overhead_allocated, total_estimated_profit"
    )
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (error) {
    console.error("Customer profit summary query failed:", error.message);
    return null;
  }

  return data as CustomerProfitSummary | null;
}

async function getInvoiceCostBreakdowns(
  jobberClientId: string
): Promise<Map<string, InvoiceCostBreakdown>> {
  const { data, error } = await supabaseServer
    .from("invoice_cost_breakdown")
    .select("jobber_invoice_id, direct_cost, overhead_allocated, estimated_profit")
    .eq("jobber_client_id", jobberClientId);

  if (error) {
    console.error("Invoice cost breakdown query failed:", error.message);
    return new Map();
  }

  const rows = (data ?? []) as InvoiceCostBreakdown[];

  return new Map(rows.map((row) => [row.jobber_invoice_id, row]));
}

type CustomerProfile = {
  turf_size_sqft: number | string | null;
  gate_code: string | null;
  pet_count: number | string | null;
  pet_names: string | null;
  odor_level: string | null;
  subscription_plan: string | null;
  service_instructions: string | null;
  notes: string | null;
};

async function getCustomerProfile(
  jobberClientId: string
): Promise<CustomerProfile | null> {
  const { data, error } = await supabaseServer
    .from("customers")
    .select(
      `
        turf_size_sqft,
        gate_code,
        pet_count,
        pet_names,
        odor_level,
        subscription_plan,
        service_instructions,
        notes
      `
    )
    .eq("jobber_client_id", jobberClientId)
    .maybeSingle();

  if (error) {
    console.error("Customer profile query failed:", error.message);
    return null;
  }

  return data as CustomerProfile | null;
}

function toNumber(
  value: number | string | null | undefined
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
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

function formatCurrency(
  value: number | string | null | undefined
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatCurrencyPrecise(
  value: number | string | null | undefined
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function decimalHoursToHMM(decimalHours: number): string {
  if (!decimalHours) {
    return "";
  }

  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(
    value.includes("T") ? value : `${value}T12:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatVisitDateTime(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function visitStatusBadge(status: string | null): string {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "COMPLETED") {
    return "bg-green-100 text-green-800";
  }

  if (normalized === "LATE") {
    return "bg-red-100 text-red-800";
  }

  if (normalized === "UPCOMING") {
    return "bg-blue-100 text-blue-800";
  }

  return "bg-gray-100 text-gray-700";
}

function formatStatus(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAddress(property: JobberProperty): string {
  const address = property.address;

  if (!address) {
    return "Address unavailable";
  }

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

function statusClasses(status: string | null): string {
  const normalized = (status ?? "").toUpperCase();

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

function VisitCostForm({
  visit,
  materialsList,
  equipmentList,
  visitUsageMap,
  visitEquipmentUsageSet,
  pageEquipmentIds,
}: {
  visit: CustomerVisit;
  materialsList: MaterialOption[];
  equipmentList: EquipmentOption[];
  visitUsageMap: Map<string, number>;
  visitEquipmentUsageSet: Set<string>;
  pageEquipmentIds: string;
}) {
  if (materialsList.length === 0) {
    return null;
  }

  return (
    <form action={saveVisitCosts} className="space-y-3">
      <input
        type="hidden"
        name="page_visit_ids"
        value={visit.jobber_visit_id}
      />
      <input
        type="hidden"
        name="page_equipment_ids"
        value={pageEquipmentIds}
      />

      <div className="grid grid-cols-2 gap-2">
        {materialsList.map((material) => {
          const isTime = material.unit_label.toLowerCase() === "hour";
          const raw =
            visitUsageMap.get(`${visit.jobber_visit_id}:${material.id}`) ||
            0;

          return (
            <label key={material.id} className="block">
              <span className="text-[10px] font-bold text-[#9c7a20]">
                {material.name}
              </span>
              <input
                type={isTime ? "text" : "number"}
                inputMode={isTime ? "text" : "decimal"}
                step={isTime ? undefined : "0.01"}
                min={isTime ? undefined : "0"}
                pattern={isTime ? "[0-9]{1,2}:[0-5][0-9]" : undefined}
                name={`usage[${visit.jobber_visit_id}][${material.id}]`}
                defaultValue={
                  isTime ? decimalHoursToHMM(raw) : raw || ""
                }
                placeholder={isTime ? "1:30" : "0"}
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-1.5 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </label>
          );
        })}
      </div>

      {equipmentList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {equipmentList.map((item) => {
            const checked = visitEquipmentUsageSet.has(
              `${visit.jobber_visit_id}:${item.id}`
            );

            return (
              <label
                key={item.id}
                className="flex items-center gap-1.5 rounded-lg bg-[#f7f6f1] px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  name={`equipment[${visit.jobber_visit_id}][${item.id}]`}
                  value="1"
                  defaultChecked={checked}
                  className="h-4 w-4 rounded border-[#d9d4c6] text-[#174734] focus:ring-[#d4af37]"
                />
                <span className="text-xs font-semibold">{item.name}</span>
              </label>
            );
          })}
        </div>
      )}

      <button
        type="submit"
        className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246]"
      >
        Save Changes
      </button>
    </form>
  );
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const [
    { client, error },
    financials,
    profile,
    profitSummary,
    invoiceCosts,
    materialsList,
    equipmentList,
    pastVisits,
    nextVisit,
  ] = await Promise.all([
    getJobberClient(decodedId),
    getCustomerFinancials(decodedId),
    getCustomerProfile(decodedId),
    getCustomerProfitSummary(decodedId),
    getInvoiceCostBreakdowns(decodedId),
    getMaterialsList(),
    getEquipmentList(),
    getPastVisits(decodedId),
    getNextVisit(decodedId),
  ]);

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

  const allVisitIds = [
    ...pastVisits.map((visit) => visit.jobber_visit_id),
    ...(nextVisit ? [nextVisit.jobber_visit_id] : []),
  ];

  const {
    usageMap: visitUsageMap,
    equipmentUsageSet: visitEquipmentUsageSet,
    costMap: visitCostMap,
  } = await getVisitUsageMaps(allVisitIds);

  const pageEquipmentIds = equipmentList.map((item) => item.id).join(",");

  const lifetimeCollected = toNumber(financials?.lifetime_collected);
  const estimatedProfit = profitSummary
    ? toNumber(profitSummary.total_estimated_profit)
    : null;

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-6 py-8 text-[#174734]">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Customer Intelligence
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
              Jobber customer since {formatDate(client.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {client.jobberWebUri && (
              <a
                href={client.jobberWebUri}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
              >
                Open in Jobber
              </a>
            )}

            {client.name && (
              <Link
                href={`/job-costs?q=${encodeURIComponent(client.name)}`}
                className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
              >
                Log Material Usage
              </Link>
            )}

            <Link
              href="/customers"
              className="rounded-xl bg-[#174734] px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Back to Customers
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-6">
            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Contact Information
              </h2>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-[#9c7a20]">
                      Email
                    </p>

                    {email ? (
                      <a
                        href={`mailto:${email}`}
                        className="mt-0.5 block break-words text-sm font-semibold hover:underline"
                      >
                        {email}
                      </a>
                    ) : (
                      <p className="mt-0.5 text-sm text-[#6b705c]">
                        No email
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#9c7a20]">
                      Phone
                    </p>

                    {phone ? (
                      <a
                        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                        className="mt-0.5 block text-sm font-semibold hover:underline"
                      >
                        {formatPhone(phone)}
                      </a>
                    ) : (
                      <p className="mt-0.5 text-sm text-[#6b705c]">
                        No phone
                      </p>
                    )}
                  </div>
                </div>

                <div className="sm:text-right">
                  <p className="text-xs font-bold text-[#9c7a20]">
                    Lifetime Collected
                  </p>

                  <p className="mt-0.5 text-2xl font-bold">
                    {formatCurrency(lifetimeCollected)}
                  </p>

                  {estimatedProfit !== null && (
                    <>
                      <p className="mt-3 text-xs font-bold text-[#9c7a20]">
                        Estimated Profit
                      </p>

                      <p
                        className={`mt-0.5 text-lg font-bold ${
                          estimatedProfit >= 0
                            ? "text-green-700"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(estimatedProfit)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t border-[#e7e2d5] pt-4">
                {properties.length > 0 ? (
                  properties.map((property) => {
                    const content = (
                      <p className="text-sm font-semibold">
                        {formatAddress(property)}
                      </p>
                    );

                    if (property.jobberWebUri) {
                      return (
                        <a
                          key={property.id}
                          href={property.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl bg-[#f7f6f1] px-3 py-2 transition hover:bg-[#efeadf]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={property.id}
                        className="rounded-xl bg-[#f7f6f1] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No properties found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">Next Visit</h2>

              {nextVisit ? (
                <>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">
                      {formatVisitDateTime(nextVisit.start_at)}
                      {nextVisit.title ? ` — ${nextVisit.title}` : ""}
                    </p>

                    <span
                      className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${visitStatusBadge(
                        nextVisit.visit_status
                      )}`}
                    >
                      {nextVisit.visit_status || "Unknown"}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-[#f0eee6] pt-4">
                    <VisitCostForm
                      visit={nextVisit}
                      materialsList={materialsList}
                      equipmentList={equipmentList}
                      visitUsageMap={visitUsageMap}
                      visitEquipmentUsageSet={visitEquipmentUsageSet}
                      pageEquipmentIds={pageEquipmentIds}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-3 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                  No upcoming visit scheduled.
                </p>
              )}
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Property Profile
              </h2>

              <p className="mt-1 text-xs text-[#6b705c]">
                Not synced from Jobber — managed here directly.
              </p>

              <form
                action={updateCustomerProfile.bind(null, decodedId)}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="turf_size_sqft"
                      className="text-xs font-bold text-[#9c7a20]"
                    >
                      Turf Size (sq ft)
                    </label>

                    <input
                      id="turf_size_sqft"
                      name="turf_size_sqft"
                      type="number"
                      min="0"
                      defaultValue={profile?.turf_size_sqft ?? ""}
                      className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pet_count"
                      className="text-xs font-bold text-[#9c7a20]"
                    >
                      Pet Count
                    </label>

                    <input
                      id="pet_count"
                      name="pet_count"
                      type="number"
                      min="0"
                      defaultValue={profile?.pet_count ?? ""}
                      className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="pet_names"
                    className="text-xs font-bold text-[#9c7a20]"
                  >
                    Pet Names
                  </label>

                  <input
                    id="pet_names"
                    name="pet_names"
                    type="text"
                    defaultValue={profile?.pet_names ?? ""}
                    placeholder="e.g. Max, Bella"
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="gate_code"
                      className="text-xs font-bold text-[#9c7a20]"
                    >
                      Gate Code
                    </label>

                    <input
                      id="gate_code"
                      name="gate_code"
                      type="text"
                      defaultValue={profile?.gate_code ?? ""}
                      className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="odor_level"
                      className="text-xs font-bold text-[#9c7a20]"
                    >
                      Odor Level
                    </label>

                    <select
                      id="odor_level"
                      name="odor_level"
                      defaultValue={profile?.odor_level ?? ""}
                      className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                    >
                      <option value="">Not set</option>
                      <option value="None">None</option>
                      <option value="Mild">Mild</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Severe">Severe</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="subscription_plan"
                    className="text-xs font-bold text-[#9c7a20]"
                  >
                    Subscription / Plan Notes
                  </label>

                  <input
                    id="subscription_plan"
                    name="subscription_plan"
                    type="text"
                    defaultValue={profile?.subscription_plan ?? ""}
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="service_instructions"
                    className="text-xs font-bold text-[#9c7a20]"
                  >
                    Service Instructions
                  </label>

                  <textarea
                    id="service_instructions"
                    name="service_instructions"
                    rows={3}
                    defaultValue={profile?.service_instructions ?? ""}
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="notes"
                    className="text-xs font-bold text-[#9c7a20]"
                  >
                    Internal Notes
                  </label>

                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    defaultValue={profile?.notes ?? ""}
                    className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
                >
                  Save Profile
                </button>
              </form>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Marketing Attribution
              </h2>

              <div className="mt-4 rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                QR campaign, lead source, first scan, conversion history, and
                campaign-generated revenue will be connected here.
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">Past Visits</h2>

              <p className="mt-1 text-xs text-[#6b705c]">
                Log materials, labor, fuel, and equipment per visit here.
              </p>

              <div className="mt-3 max-h-[600px] space-y-2 overflow-y-auto pr-1">
                {pastVisits.length > 0 ? (
                  pastVisits.map((visit) => (
                    <details
                      key={visit.jobber_visit_id}
                      className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            {formatVisitDateTime(visit.start_at)}
                            {visit.title ? ` — ${visit.title}` : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${visitStatusBadge(
                              visit.visit_status
                            )}`}
                          >
                            {visit.visit_status || "Unknown"}
                          </span>

                          <p className="text-sm font-bold">
                            {formatCurrencyPrecise(
                              visitCostMap.get(visit.jobber_visit_id) ?? 0
                            )}
                          </p>
                        </div>
                      </summary>

                      <div className="mt-4 border-t border-[#f0eee6] pt-4">
                        <VisitCostForm
                          visit={visit}
                          materialsList={materialsList}
                          equipmentList={equipmentList}
                          visitUsageMap={visitUsageMap}
                          visitEquipmentUsageSet={visitEquipmentUsageSet}
                          pageEquipmentIds={pageEquipmentIds}
                        />
                      </div>
                    </details>
                  ))
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No past visits found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Recent Invoices
              </h2>

              <div className="mt-3 space-y-2">
                {invoices.length > 0 ? (
                  invoices.map((invoice) => {
                    const cost = invoiceCosts.get(invoice.id);
                    const profit = cost
                      ? toNumber(cost.estimated_profit)
                      : null;

                    const content = (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            Invoice #{invoice.invoiceNumber ?? "—"}
                            {invoice.subject ? ` — ${invoice.subject}` : ""}
                          </p>

                          <p className="text-xs text-[#6b705c]">
                            Issued {formatDate(invoice.issuedDate)}
                          </p>

                          {cost && (
                            <p className="mt-1 text-xs text-[#6b705c]">
                              {formatCurrencyPrecise(cost.direct_cost)} direct
                              {" + "}
                              {formatCurrencyPrecise(cost.overhead_allocated)}{" "}
                              overhead
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                                invoice.invoiceStatus
                              )}`}
                            >
                              {formatStatus(invoice.invoiceStatus)}
                            </span>

                            <p className="text-sm font-bold">
                              {formatCurrency(invoice.total)}
                            </p>
                          </div>

                          {profit !== null && (
                            <p
                              className={`text-xs font-bold ${
                                profit >= 0
                                  ? "text-green-700"
                                  : "text-red-600"
                              }`}
                            >
                              {formatCurrencyPrecise(profit)} profit
                            </p>
                          )}
                        </div>
                      </div>
                    );

                    return (
                      <div
                        key={invoice.id}
                        className="overflow-hidden rounded-xl border border-[#e7e2d5]"
                      >
                        {invoice.jobberWebUri ? (
                          <a
                            href={invoice.jobberWebUri}
                            target="_blank"
                            rel="noreferrer"
                            className="block px-3 py-2 transition hover:bg-[#f7f6f1]"
                          >
                            {content}
                          </a>
                        ) : (
                          <div className="px-3 py-2">{content}</div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No invoices found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Recent Jobs
              </h2>

              <div className="mt-3 space-y-2">
                {jobs.length > 0 ? (
                  jobs.map((job) => {
                    const content = (
                      <>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">
                              Job #{job.jobNumber ?? "—"}
                              {job.title ? ` — ${job.title}` : ""}
                            </p>

                            <p className="text-xs text-[#6b705c]">
                              {formatDate(job.startAt)}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                                job.jobStatus
                              )}`}
                            >
                              {formatStatus(job.jobStatus)}
                            </span>

                            <p className="text-sm font-bold">
                              {formatCurrency(job.total)}
                            </p>
                          </div>
                        </div>
                      </>
                    );

                    if (job.jobberWebUri) {
                      return (
                        <a
                          key={job.id}
                          href={job.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-[#e7e2d5] px-3 py-2 transition hover:border-[#d4af37]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={job.id}
                        className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No jobs found.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow">
              <h2 className="text-lg font-bold">
                Recent Quotes
              </h2>

              <div className="mt-3 space-y-2">
                {quotes.length > 0 ? (
                  quotes.map((quote) => {
                    const content = (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">
                            Quote #{quote.quoteNumber ?? "—"}
                            {quote.title ? ` — ${quote.title}` : ""}
                          </p>

                          <p className="text-xs text-[#6b705c]">
                            Created {formatDate(quote.createdAt)}
                          </p>
                        </div>

                        <span
                          className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClasses(
                            quote.quoteStatus
                          )}`}
                        >
                          {formatStatus(quote.quoteStatus)}
                        </span>
                      </div>
                    );

                    if (quote.jobberWebUri) {
                      return (
                        <a
                          key={quote.id}
                          href={quote.jobberWebUri}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-[#e7e2d5] px-3 py-2 transition hover:border-[#d4af37]"
                        >
                          {content}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={quote.id}
                        className="rounded-xl border border-[#e7e2d5] px-3 py-2"
                      >
                        {content}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl bg-[#f7f6f1] px-3 py-2 text-sm text-[#6b705c]">
                    No quotes found.
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
