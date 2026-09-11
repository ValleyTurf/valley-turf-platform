"use server";

// ROADMAP.md Fresh Ideas #5 -- Seasonal promo automation. Called directly
// from CampaignComposeForm.tsx via useTransition (same pattern as
// lib/composeEmailAction.ts + ComposeEmailForm.tsx) rather than a bare
// <form action> -- a campaign send is slow enough (many recipients) and
// risky enough (real customers, real cost) that the UI needs an inline
// pending/error/result state, not a full-page redirect that would also
// throw away whatever Ryan had typed if something failed partway.
//
// 300s ceiling (Vercel route-segment config) gives a larger audience
// headroom to finish inside one request -- lib/promoCampaigns.ts sends
// with bounded concurrency (5 at a time) rather than fully sequential,
// same reasoning as lib/dailyDigest.ts already doing real per-customer
// work inside one Vercel function run.
export const maxDuration = 300;

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/currentUser";
import {
  sendPromoCampaign,
  type CampaignChannel,
  type CampaignFilters,
} from "@/lib/promoCampaigns";

export type SendCampaignActionResult = {
  error: string | null;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
};

export async function sendCampaignAction(params: {
  name: string;
  channels: CampaignChannel[];
  subject: string;
  body: string;
  filters: CampaignFilters;
}): Promise<SendCampaignActionResult> {
  // Defense in depth -- the real enforcement is /campaigns' entry in
  // lib/permissionRules.ts's MANAGER_PLUS_PREFIXES, same relationship
  // requireManager has everywhere else it's used (see that function's
  // own doc comment in lib/currentUser.ts).
  const actor = await requireManager().catch(() => null);

  if (!actor) {
    return { error: "Manager access required." };
  }

  const result = await sendPromoCampaign({
    name: params.name.trim() || "Untitled Campaign",
    channels: params.channels,
    subject: params.subject.trim() || null,
    body: params.body.trim(),
    filters: params.filters,
    actorUserId: actor.id,
    actorName: actor.name,
  });

  revalidatePath("/campaigns");

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    error: null,
    recipientCount: result.value.recipientCount,
    sentCount: result.value.sentCount,
    failedCount: result.value.failedCount,
  };
}
