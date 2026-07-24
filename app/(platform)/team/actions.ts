"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/passwords";
import { requireAdmin } from "@/lib/currentUser";

// Returned instead of thrown so forms can show the message inline via
// useActionState, rather than crashing to Next's generic error screen.
export type ActionState = { error: string | null };

export const initialActionState: ActionState = { error: null };

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanRole(value: FormDataEntryValue | null): "admin" | "staff" {
  return value === "admin" ? "admin" : "staff";
}

function cleanHourlyRate(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Active admins other than `excludingId` — used to make sure an edit or
// delete never leaves the account with zero people who can log into
// Team/Settings.
async function countOtherActiveAdmins(excludingId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true)
    .neq("id", excludingId);

  if (error) {
    throw new Error(`Failed to check admin count: ${error.message}`);
  }

  return count ?? 0;
}

export async function addUser(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const name = cleanText(formData.get("name"));
  const email = cleanText(formData.get("email"));
  const password = cleanText(formData.get("password"));
  const role = cleanRole(formData.get("role"));
  const hourlyRate = cleanHourlyRate(formData.get("hourly_rate"));

  if (!name || !email || !password) {
    return { error: "Name, email, and a starting password are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { error } = await supabaseServer.from("users").insert({
    name,
    email: email.toLowerCase(),
    password_hash: hashPassword(password),
    role,
    hourly_rate: hourlyRate,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `A user with the email ${email} already exists.` };
    }

    return { error: `Failed to add user: ${error.message}` };
  }

  revalidatePath("/team");

  return { error: null };
}

export async function updateUser(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const currentUser = await requireAdmin();

  const name = cleanText(formData.get("name"));
  const role = cleanRole(formData.get("role"));
  const active = formData.get("active") === "on";
  const hourlyRate = cleanHourlyRate(formData.get("hourly_rate"));

  if (!name) {
    return { error: "Name is required." };
  }

  if (currentUser.id === id && (role !== "admin" || !active)) {
    return {
      error:
        "You can't remove your own admin access or deactivate your own account.",
    };
  }

  const willRemainActiveAdmin = role === "admin" && active;

  if (!willRemainActiveAdmin) {
    const otherAdmins = await countOtherActiveAdmins(id);

    if (otherAdmins === 0) {
      return {
        error:
          "This is the last active admin — promote someone else to admin first.",
      };
    }
  }

  const { error } = await supabaseServer
    .from("users")
    .update({
      name,
      role,
      active,
      hourly_rate: hourlyRate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: `Failed to update user: ${error.message}` };
  }

  revalidatePath("/team");

  return { error: null };
}

export async function resetUserPassword(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const password = cleanText(formData.get("password"));

  if (!password || password.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  const { error } = await supabaseServer
    .from("users")
    .update({
      password_hash: hashPassword(password),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: `Failed to reset password: ${error.message}` };
  }

  revalidatePath("/team");

  return { error: null };
}

export async function deleteUser(
  id: string,
  _prevState: ActionState
): Promise<ActionState> {
  const currentUser = await requireAdmin();

  if (currentUser.id === id) {
    return { error: "You can't delete your own account." };
  }

  const { data: target, error: lookupError } = await supabaseServer
    .from("users")
    .select("role, active")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return { error: `Failed to look up user: ${lookupError.message}` };
  }

  if (target?.role === "admin" && target?.active) {
    const otherAdmins = await countOtherActiveAdmins(id);

    if (otherAdmins === 0) {
      return {
        error:
          "This is the last active admin — promote someone else before removing this account.",
      };
    }
  }

  const { error } = await supabaseServer.from("users").delete().eq("id", id);

  if (error) {
    return { error: `Failed to delete user: ${error.message}` };
  }

  revalidatePath("/team");

  return { error: null };
}
