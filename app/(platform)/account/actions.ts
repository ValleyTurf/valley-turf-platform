"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";
import type { ChangePasswordState } from "./actionState";
import { pushKindsForRole } from "@/lib/pushKinds";

export async function changeOwnPassword(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: "Not signed in.", success: false };
  }

  const currentPassword = formData.get("current_password");
  const newPassword = formData.get("new_password");

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return { error: "Both fields are required.", success: false };
  }

  if (newPassword.length < 8) {
    return {
      error: "New password must be at least 8 characters.",
      success: false,
    };
  }

  const { data, error } = await supabaseServer
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .single();

  if (error || !data || !verifyPassword(currentPassword, data.password_hash)) {
    return { error: "Current password is incorrect.", success: false };
  }

  const { error: updateError } = await supabaseServer
    .from("users")
    .update({
      password_hash: hashPassword(newPassword),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return {
      error: `Failed to update password: ${updateError.message}`,
      success: false,
    };
  }

  await recordAuditLog({
    actor: user,
    action: "update",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    note: "Changed own password",
  });

  revalidatePath("/account");

  return { error: null, success: true };
}

// Saves which kinds of push notification the signed-in person wants
// (migration 108). The form has one checkbox per kind their role is
// allowed (lib/pushKinds.ts); what gets stored is the list they left
// UNCHECKED, so a kind added later is on by default for everyone. Only
// ever touches the caller's own row.
export async function savePushPreferences(formData: FormData): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Not signed in.");
  }

  const disabledKinds = pushKindsForRole(user.role)
    .map((entry) => entry.kind)
    .filter((kind) => formData.get(`push_${kind}`) !== "on");

  const { error } = await supabaseServer.from("user_push_preferences").upsert(
    {
      user_id: user.id,
      disabled_kinds: disabledKinds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`Couldn't save notification settings: ${error.message}`);
  }

  revalidatePath("/account");
}
