export const dynamic = "force-dynamic";
export const revalidate = 0;
// 300s ceiling (Vercel route-segment config) gives a larger audience
// headroom to finish inside one request -- lib/promoCampaigns.ts sends
// with bounded concurrency (5 at a time) rather than fully sequential,
// same reasoning as lib/dailyDigest.ts already doing real per-customer
// work inside one Vercel function run. This also covers the
// sendCampaignAction Server Action invoked from this page (see
// actions.ts's header comment for why it isn't exported from there).
export const maxDuration = 300;

// ROADMAP.md Fresh Ideas #5 -- Seasonal promo automation. Manual,
// one-click campaigns: build an audience filter (this page, plain
// searchParams-driven links, same pattern as app/(platform)/customers),
// write a message once, hit Send (CampaignComposeForm.tsx). Nothing here
// runs on a schedule -- see lib/promoCampaigns.ts's header comment.
import Link from "next/link";
import {
  RECURRING_STATUS_OPTIONS,
  CAMPAIGN_CATEGORY_OPTIONS,
  isRecurringStatusFilter,
  resolveAudience,
  getDistinctCustomerCities,
  getRecentCampaigns,
  type CampaignFilters,
  type RecurringStatusFilter,
} from "@/lib/promoCampaigns";
import CampaignComposeForm from "./CampaignComposeForm";

type CampaignsPageProps = {
  searchParams: Promise<{
    recurringStatus?: string;
    category?: string;
    city?: string;
  }>;
};

type UrlState = { recurringStatus: string; category: string; city: string };

function buildCampaignsUrl(
  overrides: Partial<UrlState>,
  current: UrlState
): string {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.recurringStatus !== "all") {
    params.set("recurringStatus", merged.recurringStatus);
  }

  if (merged.recurringStatus === "active_recurring" && merged.category) {
    params.set("category", merged.category);
  }

  if (merged.city) {
    params.set("city", merged.city);
  }

  const query = params.toString();
  return query ? `/campaigns?${query}` : "/campaigns";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function CampaignsPage({
  searchParams,
}: CampaignsPageProps) {
  const params = await searchParams;

  const recurringStatus: RecurringStatusFilter =
    params.recurringStatus && isRecurringStatusFilter(params.recurringStatus)
      ? params.recurringStatus
      : "all";

  const category =
    recurringStatus === "active_recurring" && params.category
      ? params.category
      : null;

  const city = params.city || null;

  const filters: CampaignFilters = { recurringStatus, category, city };

  const [audience, cities, recentCampaigns] = await Promise.all([
    resolveAudience(filters, ["email", "sms"]),
    getDistinctCustomerCities(),
    getRecentCampaigns(),
  ]);

  const currentForUrl: UrlState = {
    recurringStatus,
    category: category ?? "",
    city: city ?? "",
  };

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Marketing
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Seasonal Campaigns
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#6b705c]">
              Build a customer segment, write a message once, and send it
              yourself — nothing here runs on a schedule.
            </p>
          </div>

          <Link
            href="/reports"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Reports
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            1. Build your audience
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {RECURRING_STATUS_OPTIONS.map((option) => (
              <Link
                key={option.key}
                href={buildCampaignsUrl(
                  { recurringStatus: option.key, category: "" },
                  currentForUrl
                )}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  recurringStatus === option.key
                    ? "bg-[#174734] text-white"
                    : "border border-[#d9d4c6] bg-white text-[#174734] hover:bg-[#f7f6f1]"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>

          {recurringStatus === "active_recurring" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-semibold text-[#6b705c]">
                Plan:
              </span>
              <Link
                href={buildCampaignsUrl({ category: "" }, currentForUrl)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  !category
                    ? "bg-[#9c7a20] text-white"
                    : "border border-[#e3ded1] bg-white text-[#9c7a20] hover:bg-[#faf4e3]"
                }`}
              >
                Any Plan
              </Link>
              {CAMPAIGN_CATEGORY_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={buildCampaignsUrl({ category: option }, currentForUrl)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    category === option
                      ? "bg-[#9c7a20] text-white"
                      : "border border-[#e3ded1] bg-white text-[#9c7a20] hover:bg-[#faf4e3]"
                  }`}
                >
                  {option}
                </Link>
              ))}
            </div>
          )}

          {cities.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-semibold text-[#6b705c]">
                City:
              </span>
              <Link
                href={buildCampaignsUrl({ city: "" }, currentForUrl)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  !city
                    ? "bg-[#174734] text-white"
                    : "border border-[#d9d4c6] bg-white text-[#174734] hover:bg-[#f7f6f1]"
                }`}
              >
                Any City
              </Link>
              {cities.map((c) => (
                <Link
                  key={c}
                  href={buildCampaignsUrl({ city: c }, currentForUrl)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    city === c
                      ? "bg-[#174734] text-white"
                      : "border border-[#d9d4c6] bg-white text-[#174734] hover:bg-[#f7f6f1]"
                  }`}
                >
                  {c}
                </Link>
              ))}
            </div>
          )}

          <p className="mt-4 text-sm text-[#6b705c]">
            Matches{" "}
            <span className="font-bold text-[#174734]">{audience.length}</span>{" "}
            customer{audience.length === 1 ? "" : "s"} reachable by email or
            text (exact reach depends on which channel(s) you pick below).
            {audience.length > 0 && (
              <>
                {" "}
                e.g. {audience.slice(0, 5).map((a) => a.name).join(", ")}
                {audience.length > 5 ? `, +${audience.length - 5} more` : ""}.
              </>
            )}
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            2. Write &amp; send
          </p>
          <CampaignComposeForm filters={filters} audienceCount={audience.length} />
        </section>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
            Recent Campaigns
          </p>

          {recentCampaigns.length === 0 ? (
            <p className="mt-3 text-sm text-[#6b705c]">
              No campaigns sent yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {recentCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-xl border border-[#eee9dc] p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{campaign.name}</p>
                    <p className="text-xs text-[#6b705c]">
                      {formatDate(campaign.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-[#6b705c]">
                    {campaign.audienceDescription} · {campaign.channels.join(" + ")} ·
                    Sent {campaign.sentCount} of {campaign.recipientCount}
                    {campaign.failedCount > 0
                      ? `, ${campaign.failedCount} failed`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
