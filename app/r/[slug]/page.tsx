import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: campaign } = await supabaseServer
    .from("campaigns")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!campaign) {
    return <div>Campaign not found</div>;
  }

  const headersList = await headers();

  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0] ||
    headersList.get("x-real-ip") ||
    null;

  const city = headersList.get("x-vercel-ip-city");
  const region = headersList.get("x-vercel-ip-country-region");
  const country = headersList.get("x-vercel-ip-country");
  const userAgent = headersList.get("user-agent");

  await supabaseServer.from("scans").insert({
    campaign_id: campaign.id,
    user_agent: userAgent,
    ip_address: ip,
    city,
    region,
    country,
  });

  redirect(campaign.destination);
}