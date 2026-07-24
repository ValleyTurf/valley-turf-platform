"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { getCurrentUser } from "@/lib/currentUser";

export async function changeOwnPassword(formData: FormData): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Not signed in.");
  }

  const currentPassword = formData.get("current_password");
  const newPassword = formData.get("new_password");

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    throw new Error("Both fields are required.");
  }

  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const { data, error } = await supabaseServer
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .single();

  if (error || !data || !verifyPassword(currentPassword, data.password_hash)) {
    throw new Error("Current password is incorrect.");
  }

  const { error: updateError } = await supabaseServer
    .from("users")
    .update({
      password_hash: hashPassword(newPassword),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    throw new Error(`Failed to update password: ${updateError.message}`);
  }

  revalidatePath("/account");
}
