"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { getCurrentUser } from "@/lib/currentUser";

// Returned instead of thrown so the form can show the message inline via
// useActionState, rather than crashing to Next's generic error screen.
export type ChangePasswordState = { error: string | null; success: boolean };

export const initialChangePasswordState: ChangePasswordState = {
  error: null,
  success: false,
};

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

  revalidatePath("/account");

  return { error: null, success: true };
}
