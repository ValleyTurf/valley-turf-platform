"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/passwords";
import { requireAdmin } from "@/lib/currentUser";

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

export async function addUser(formData: FormData): Promise<void> {
  await requireAdmin();

  const name = cleanText(formData.get("name"));
  const email = cleanText(formData.get("email"));
  const password = cleanText(formData.get("password"));
  const role = cleanRole(formData.get("role"));
  const hourlyRate = cleanHourlyRate(formData.get("hourly_rate"));

  if (!name || !email || !password) {
    throw new Error("Name, email, and a starting password are required.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
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
      throw new Error(`A user with the email ${email} already exists.`);
    }

    throw new Error(`Failed to add user: ${error.message}`);
  }

  revalidatePath("/team");
}

export async function updateUser(
  id: string,
  formData: FormData
): Promise<void> {
  const currentUser = await requireAdmin();

  const name = cleanText(formData.get("name"));
  const role = cleanRole(formData.get("role"));
  const active = formData.get("active") === "on";
  const hourlyRate = cleanHourlyRate(formData.get("hourly_rate"));

  if (!name) {
    throw new Error("Name is required.");
  }

  if (currentUser.id === id && (role !== "admin" || !active)) {
    throw new Error(
      "You can't remove your own admin access or deactivate your own account."
    );
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
    throw new Error(`Failed to update user: ${error.message}`);
  }

  revalidatePath("/team");
}

export async function resetUserPassword(
  id: string,
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const password = cleanText(formData.get("password"));

  if (!password || password.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const { error } = await supabaseServer
    .from("users")
    .update({
      password_hash: hashPassword(password),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to reset password: ${error.message}`);
  }

  revalidatePath("/team");
}

export async function deleteUser(id: string): Promise<void> {
  const currentUser = await requireAdmin();

  if (currentUser.id === id) {
    throw new Error("You can't delete your own account.");
  }

  const { error } = await supabaseServer.from("users").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete user: ${error.message}`);
  }

  revalidatePath("/team");
}
