import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = supabaseServer;

  const { slug } = await params;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("slug", slug)
    .single();

  console.log("Campaign:", campaign);
  console.log("Campaign error:", error);

  if (!campaign) {
    return <div>Campaign not found</div>;
  }

  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .insert({
      campaign_id: campaign.id,
      user_agent: "QR Scan",
    })
    .select();

  console.log("SCAN RESULT:", scan);
  console.log("SCAN ERROR:", scanError);

  redirect(campaign.destination);
}