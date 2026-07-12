import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function decodeHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: campaign, error: campaignError } = await supabaseServer
    .from("campaigns")
    .select("id, slug, destination")
    .eq("slug", slug)
    .single();

  if (campaignError || !campaign) {
    return <div>Campaign not found</div>;
  }

  const headersList = await headers();

  const forwardedFor = headersList.get("x-forwarded-for");

  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    null;

  const city = decodeHeaderValue(
    headersList.get("x-vercel-ip-city")
  );

  const region = decodeHeaderValue(
    headersList.get("x-vercel-ip-country-region")
  );

  const country = decodeHeaderValue(
    headersList.get("x-vercel-ip-country")
  );

  const userAgent = headersList.get("user-agent");

  const { error: scanError } = await supabaseServer
    .from("scans")
    .insert({
      campaign_id: campaign.id,
      user_agent: userAgent,
      ip_address: ip,
      city,
      region,
      country,
    });

  if (scanError) {
    console.error("QR scan insert failed:", scanError);
  }

  redirect(campaign.destination);
}