"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/currentPortalUser";
import type { PortalSessionUser } from "@/lib/portalAuth";
import {
  validateExtraContact,
  validatePrimaryContact,
} from "@/lib/portalContactLogic";
import {
  addPortalContact,
  removePortalContact,
  updatePrimaryContact,
} from "@/lib/portalAccount";

async function currentCustomer(): Promise<PortalSessionUser> {
  try {
    return await requirePortalUser();
  } catch {
    redirect("/portal/login");
  }
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function savePrimaryContact(formData: FormData): Promise<void> {
  const customer = await currentCustomer();

  const parsed = validatePrimaryContact({
    email: text(formData, "email"),
    phone: text(formData, "phone"),
  });

  if (!parsed.ok) redirect(`/portal/account?result=${parsed.error}`);

  const result = await updatePrimaryContact({
    jobberClientId: customer.jobberClientId,
    customerName: customer.name,
    email: parsed.email,
    phone: parsed.phone,
  });

  if (!result.ok) redirect(`/portal/account?result=${result.error}`);

  redirect("/portal/account?result=saved");
}

export async function addExtraContact(formData: FormData): Promise<void> {
  const customer = await currentCustomer();

  const parsed = validateExtraContact({
    name: text(formData, "name"),
    label: text(formData, "label"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    receivesNotifications: formData.get("receives_notifications") === "on",
  });

  if (!parsed.ok) redirect(`/portal/account?result=${parsed.error}`);

  const result = await addPortalContact(customer.jobberClientId, customer.name, parsed);

  if (!result.ok) redirect(`/portal/account?result=${result.error}`);

  redirect("/portal/account?result=contact_added");
}

export async function removeExtraContact(formData: FormData): Promise<void> {
  const customer = await currentCustomer();
  const contactId = text(formData, "contact_id");

  if (!contactId) redirect("/portal/account?result=error");

  const result = await removePortalContact(customer.jobberClientId, customer.name, contactId);

  if (!result.ok) redirect(`/portal/account?result=${result.error}`);

  redirect("/portal/account?result=contact_removed");
}
