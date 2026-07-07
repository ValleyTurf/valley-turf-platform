import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = supabaseServer;

  const { slug } = await params;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!campaign) {
    return <div>Campaign not found</div>;
  }

  await supabase
    .from("scans")
    .insert({
      campaign_id: campaign.id,
      user_agent: "QR Scan",
    });

  redirect(campaign.destination);
}