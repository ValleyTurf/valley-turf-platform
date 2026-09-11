"use server";

// ROADMAP.md Fresh Ideas #5 -- Seasonal promo automation. Called directly
// from CampaignComposeForm.tsx via useTransition (same pattern as
// lib/composeEmailAction.ts + ComposeEmailForm.tsx) rather than a bare
// <form action> -- a campaign send is slow enough (many recipients) and
// risky enough (real customers, real cost) that the UI needs an inline
// pending/error/result state, not a full-page redirect that would also
// throw away whatever Ryan had typed if something failed partway.
//
// NOTE: the 300s maxDuration for this route lives in page.tsx, not here.
// A "use server" file's exports are all treated as Server Action
// references by Next's compiler, which only allows async-function
// exports from a file marked "use server" -- a plain constant export
// like `export const maxDuration = 300` alongside it broke that
// transform (Turbopack silently emitted a module with zero exports,
// which is what surfaced as the "sendCampaignAction not found" build
// failure). Route segment config is recognized on page.tsx anyway, and
// it covers the Server Actions invoked from that page too, so moving it
// there gives the same 300s ceiling without touching this file's export
// shape.

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
