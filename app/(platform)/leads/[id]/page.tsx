export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lead detail page -- Ryan, 2026-09-28: "I only see the lead and don't
// see the answers to her form... I need to know her sq footage to do
// her quote but it doesn't show anywhere." /leads has always been a
// list-only page (LeadsTable.tsx renders a fixed column set), so a
// field the intake form actually captures -- turf_size_range, notes,
// photos, SMS consent, the raw address-validation result -- was never
// visible anywhere in the app once submitted, even though it's sitting
// on the leads row the whole time. This is that missing "click a lead,
// see the whole form" view, reached from LeadsTable's Name column.
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeEmail, normalizePhone } from "@/lib/matching";
import { setLeadStatus, deleteLead } from "../actions";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";

type LeadDetail = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  status: string | null;
  notes: string | null;
  turf_size_range: string | null;
  photo_paths: string[] | null;
  sms_consent: boolean | null;
  sms_consent_at: string | null;
  address_validation_status: string | null;
  address_validated_at: string | null;
  address_formatted: string | null;
  address_lat: number | string | null;
  address_lng: number | string | null;
  campaign_id: string | null;
  scan_count: number | null;
  jobber_client_id: string | null;
  created_at: string;
};

type Campaign = {
  id: string;
  name: string;
  alias: string | null;
  slug: string;
};

type CustomerMatch = {
  jobber_client_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

// Public bucket (050_add_lead_form_fields.sql) -- same
// path-to-public-URL pattern as lib/visitNotes.ts's visitNotePhotoUrl.
const LEAD_PHOTO_BUCKET = "lead-photos";

function leadPhotoUrl(path: string): string {
  return supabaseServer.storage.from(LEAD_PHOTO_BUCKET).getPublicUrl(path)
    .data.publicUrl;
}

function formatArizonaTime(value: string | null) {
  if (!value) return "Unknown";

  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function statusBadge(status: string | null) {
  const normalized = (status || "New").toLowerCase();

  if (normalized === "new") {
    return "bg-[#d4af37]/20 text-[#9c7a20]";
  }

  if (normalized === "converted" || normalized === "won") {
    return "bg-[#174734]/10 text-[#174734]";
  }

  if (normalized === "lost" || normalized === "dead") {
    return "bg-red-100 text-red-700";
  }

  return "bg-[#f0eee6] text-[#6b705c]";
}

// Same mapping as leads/page.tsx's addressValidationBadge.
function addressValidationBadge(
  status: string | null
): { label: string; className: string } | null {
  if (status === "fix") {
    return { label: "Needs Fix", className: "bg-red-100 text-red-700" };
  }

  if (status === "confirm" || status === "confirm_add_subpremises") {
    return {
      label: "Please Confirm",
      className: "bg-[#d4af37]/20 text-[#9c7a20]",
    };
  }

  if (status === "accept") {
    return { label: "Verified", className: "bg-[#174734]/10 text-[#174734]" };
  }

  return null;
}

const fieldLabel = "text-xs font-bold uppercase tracking-wide text-[#9c7a20]";
const fieldValue = "mt-1 text-sm text-[#174734]";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const leadId = decodeURIComponent(id);

  const { data: leadData, error } = await supabaseServer
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, address, city, state, zip, source, status, notes, turf_size_range, photo_paths, sms_consent, sms_consent_at, address_validation_status, address_validated_at, address_formatted, address_lat, address_lng, campaign_id, scan_count, jobber_client_id, created_at"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    return (
      <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-5 shadow">
          <p className="font-bold text-red-700">This lead could not be loaded</p>
          <p className="mt-1 text-sm text-red-600">{error.message}</p>
        </div>
      </main>
    );
  }

  if (!leadData) {
    notFound();
  }

  const lead = leadData as LeadDetail;

  const [campaignResult, customersResult] = await Promise.all([
    lead.campaign_id
      ? supabaseServer
          .from("campaigns")
          .select("id, name, alias, slug")
          .eq("id", lead.campaign_id)
          .maybeSingle()
      : Promise.resolve({ data: null as Campaign | null }),
    // Same in-memory normalize-then-match convention as leads/page.tsx --
    // there's no normalized column on customers to query directly, and
    // this is a one-off page load rather than a hot path.
    supabaseServer
      .from("customers")
      .select("jobber_client_id, full_name, email, phone"),
  ]);

  const campaign = campaignResult.data as Campaign | null;

  const normalizedLeadPhone = normalizePhone(lead.phone);
  const normalizedLeadEmail = normalizeEmail(lead.email);

  const customerMatch = ((customersResult.data ?? []) as CustomerMatch[]).find(
    (customer) =>
      (normalizedLeadPhone &&
        normalizePhone(customer.phone) === normalizedLeadPhone) ||
      (normalizedLeadEmail &&
        normalizeEmail(customer.email) === normalizedLeadEmail)
  );

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
  const displayAddress =
    lead.address_formatted ||
    [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ") ||
    null;
  const addressBadge = addressValidationBadge(lead.address_validation_status);
  const status = lead.status || "New";
  const campaignLabel = campaign ? campaign.alias || campaign.name : null;
  const photoPaths = lead.photo_paths ?? [];
  const rawStatus = (lead.status || "new").toLowerCase();

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/leads"
          className="text-sm font-semibold text-[#9c7a20] hover:underline"
        >
          ← Back to Leads
        </Link>

        <section className="mt-4 rounded-3xl bg-gradient-to-r from-[#174734] to-[#226246] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#d4af37]">
            Valley Turf Revival
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{name}</h1>
          <p className="mt-2 text-green-50">
            Captured {formatArizonaTime(lead.created_at)}
            {lead.source ? ` · ${lead.source}` : ""}
            {campaignLabel ? ` · ${campaignLabel}` : ""}
          </p>
          <span
            className={`mt-3 inline-block w-fit rounded-full px-3 py-1 text-xs font-bold ${statusBadge(
              lead.status
            )}`}
          >
            {status}
          </span>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            href={`/quotes/new?leadId=${encodeURIComponent(lead.id)}`}
            className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
          >
            Create Quote
          </Link>

          {rawStatus !== "contacted" && (
            <form action={setLeadStatus.bind(null, lead.id, "contacted")}>
              <button
                type="submit"
                className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-bold text-[#174734] transition hover:border-[#d4af37]"
              >
                Mark Contacted
              </button>
            </form>
          )}

          {rawStatus !== "lost" && (
            <form action={setLeadStatus.bind(null, lead.id, "lost")}>
              <button
                type="submit"
                className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-bold text-[#6b705c] transition hover:border-red-300 hover:text-red-700"
              >
                Mark Lost
              </button>
            </form>
          )}

          {rawStatus !== "new" && (
            <form action={setLeadStatus.bind(null, lead.id, "new")}>
              <button
                type="submit"
                className="rounded-xl border border-[#d8d3c6] bg-white px-4 py-2 text-sm font-semibold text-[#6b705c] transition hover:border-[#d4af37]"
              >
                Reset to New
              </button>
            </form>
          )}

          <form action={deleteLead.bind(null, lead.id)}>
            <ConfirmSubmitButton
              confirmMessage={`Delete the lead for ${name}? This can't be undone.`}
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>

        {customerMatch && (
          <section className="mt-6 rounded-2xl border border-[#174734]/20 bg-[#174734]/5 p-4">
            <p className="text-sm">
              Already a customer:{" "}
              <Link
                href={`/customers/${encodeURIComponent(
                  customerMatch.jobber_client_id
                )}`}
                className="font-bold text-[#174734] hover:underline"
              >
                {customerMatch.full_name || "View Customer"}
              </Link>
            </p>
          </section>
        )}

        <section className="mt-6 grid gap-6 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm sm:grid-cols-2">
          <div>
            <p className={fieldLabel}>Phone</p>
            <p className={fieldValue}>{lead.phone || "—"}</p>
          </div>

          <div>
            <p className={fieldLabel}>Email</p>
            <p className={fieldValue}>{lead.email || "—"}</p>
          </div>

          <div className="sm:col-span-2">
            <p className={fieldLabel}>Service Address</p>
            <p className={fieldValue}>{displayAddress || "—"}</p>
            {addressBadge && (
              <span
                className={`mt-1 inline-block w-fit rounded-full px-2 py-0.5 text-xs font-bold ${addressBadge.className}`}
              >
                {addressBadge.label}
              </span>
            )}
          </div>

          <div>
            <p className={fieldLabel}>Approximate Turf Size</p>
            <p className={fieldValue}>
              {lead.turf_size_range ? `${lead.turf_size_range} sq ft` : "Not provided"}
            </p>
          </div>

          <div>
            <p className={fieldLabel}>SMS Consent</p>
            <p className={fieldValue}>
              {lead.sms_consent
                ? `Yes${
                    lead.sms_consent_at
                      ? ` (${formatArizonaTime(lead.sms_consent_at)})`
                      : ""
                  }`
                : "No"}
            </p>
          </div>

          <div className="sm:col-span-2">
            <p className={fieldLabel}>Notes From the Form</p>
            <p className={`${fieldValue} whitespace-pre-wrap`}>
              {lead.notes || "No notes submitted."}
            </p>
          </div>
        </section>

        {photoPaths.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[#e7e2d5] bg-white p-6 shadow-sm">
            <p className={fieldLabel}>Photos From the Form</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photoPaths.map((path) => (
                <a
                  key={path}
                  href={leadPhotoUrl(path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-xl border border-[#e7e2d5]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, not a local/optimized asset */}
                  <img
                    src={leadPhotoUrl(path)}
                    alt="Photo submitted with the quote request"
                    className="h-32 w-full object-cover transition hover:opacity-90"
                  />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
