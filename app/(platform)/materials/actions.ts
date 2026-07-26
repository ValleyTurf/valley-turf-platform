"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { recordAuditLog } from "@/lib/auditLog";

function cleanText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value;
}

function parseQuantity(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return NaN;
  }

  const trimmed = value.trim();

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return NaN;
    }

    return hours + minutes / 60;
  }

  return Number(trimmed);
}

// ---------- Materials ----------

export async function addMaterial(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();

  const row = {
    name: cleanText(formData.get("name")),
    unit_label: cleanText(formData.get("unit_label")),
    unit_cost: cleanNumber(formData.get("unit_cost")),
    notes: cleanText(formData.get("notes")),
  };

  const { data, error } = await supabaseServer
    .from("materials")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add material: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "material",
    entityId: data?.id ?? null,
    entityLabel: row.name,
    after: row,
  });

  revalidatePath("/materials");
  revalidatePath("/job-costs");
}

export async function updateMaterial(
  id: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("materials")
    .select("name, unit_label, unit_cost, notes")
    .eq("id", id)
    .maybeSingle();

  const row = {
    name: cleanText(formData.get("name")),
    unit_label: cleanText(formData.get("unit_label")),
    unit_cost: cleanNumber(formData.get("unit_cost")),
    notes: cleanText(formData.get("notes")),
  };

  const { error } = await supabaseServer
    .from("materials")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update material: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "material",
    entityId: id,
    entityLabel: row.name,
    before,
    after: row,
  });

  revalidatePath("/materials");
  revalidatePath("/job-costs");
}

export async function deleteMaterial(id: string): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("materials")
    .select("name, unit_label, unit_cost, notes")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer.from("materials").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete material: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "material",
    entityId: id,
    entityLabel: before?.name ?? null,
    before,
  });

  revalidatePath("/materials");
  revalidatePath("/job-costs");
}

// ---------- Equipment ----------

export async function addEquipment(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();

  const row = {
    name: cleanText(formData.get("name")),
    total_cost: cleanNumber(formData.get("total_cost")),
    in_service_date: cleanDate(formData.get("in_service_date")),
    retired_date: cleanDate(formData.get("retired_date")),
    notes: cleanText(formData.get("notes")),
  };

  const { data, error } = await supabaseServer
    .from("equipment")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add equipment: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "equipment",
    entityId: data?.id ?? null,
    entityLabel: row.name,
    after: row,
  });

  revalidatePath("/equipment");
  revalidatePath("/job-costs");
}

export async function updateEquipment(
  id: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("equipment")
    .select("name, total_cost, in_service_date, retired_date, notes")
    .eq("id", id)
    .maybeSingle();

  const row = {
    name: cleanText(formData.get("name")),
    total_cost: cleanNumber(formData.get("total_cost")),
    in_service_date: cleanDate(formData.get("in_service_date")),
    retired_date: cleanDate(formData.get("retired_date")),
    notes: cleanText(formData.get("notes")),
  };

  const { error } = await supabaseServer
    .from("equipment")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update equipment: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "equipment",
    entityId: id,
    entityLabel: row.name,
    before,
    after: row,
  });

  revalidatePath("/equipment");
  revalidatePath("/job-costs");
}

export async function deleteEquipment(id: string): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("equipment")
    .select("name, total_cost, in_service_date, retired_date, notes")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer.from("equipment").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete equipment: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "equipment",
    entityId: id,
    entityLabel: before?.name ?? null,
    before,
  });

  revalidatePath("/equipment");
  revalidatePath("/job-costs");
}

// ---------- Combined job cost entry (materials + labor + fuel + equipment) ----------

export async function saveJobCosts(formData: FormData): Promise<void> {
  const parsedUsageRows: {
    jobber_invoice_id: string;
    material_id: string;
    quantity_used: number;
  }[] = [];

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^usage\[(.+?)\]\[(.+?)\]$/);

    if (!match) {
      continue;
    }

    const jobberInvoiceId = match[1];
    const materialId = match[2];
    const quantity = parseQuantity(value);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    parsedUsageRows.push({
      jobber_invoice_id: jobberInvoiceId,
      material_id: materialId,
      quantity_used: quantity,
    });
  }

  if (parsedUsageRows.length > 0) {
    const materialIds = Array.from(
      new Set(parsedUsageRows.map((row) => row.material_id))
    );

    const materialsResult = await supabaseServer
      .from("materials")
      .select("id, unit_cost")
      .in("id", materialIds);

    if (materialsResult.error) {
      throw new Error(
        `Failed to load material rates: ${materialsResult.error.message}`
      );
    }

    const unitCostMap = new Map<string, number>(
      (materialsResult.data ?? []).map((material) => [
        material.id as string,
        Number(material.unit_cost ?? 0),
      ])
    );

    const usageRows = parsedUsageRows.map((row) => ({
      jobber_invoice_id: row.jobber_invoice_id,
      material_id: row.material_id,
      quantity_used: row.quantity_used,
      unit_cost_at_time: unitCostMap.get(row.material_id) ?? 0,
    }));

    const usageResult = await supabaseServer
      .from("invoice_material_usage")
      .upsert(usageRows, { onConflict: "jobber_invoice_id,material_id" });

    if (usageResult.error) {
      throw new Error(
        `Failed to save invoice material usage: ${usageResult.error.message}`
      );
    }
  }

  const pageInvoiceIdsRaw = formData.get("page_invoice_ids");
  const pageInvoiceIds =
    typeof pageInvoiceIdsRaw === "string" && pageInvoiceIdsRaw
      ? pageInvoiceIdsRaw.split(",").filter(Boolean)
      : [];

  const pageEquipmentIdsRaw = formData.get("page_equipment_ids");
  const pageEquipmentIds =
    typeof pageEquipmentIdsRaw === "string" && pageEquipmentIdsRaw
      ? pageEquipmentIdsRaw.split(",").filter(Boolean)
      : [];

  if (pageInvoiceIds.length > 0 && pageEquipmentIds.length > 0) {
    const checkedRows: { jobber_invoice_id: string; equipment_id: string }[] = [];

    for (const [key, value] of formData.entries()) {
      const match = key.match(/^equipment\[(.+?)\]\[(.+?)\]$/);

      if (!match) {
        continue;
      }

      if (value !== "1") {
        continue;
      }

      checkedRows.push({
        jobber_invoice_id: match[1],
        equipment_id: match[2],
      });
    }

    const deleteResult = await supabaseServer
      .from("equipment_usage")
      .delete()
      .in("jobber_invoice_id", pageInvoiceIds)
      .in("equipment_id", pageEquipmentIds);

    if (deleteResult.error) {
      throw new Error(
        `Failed to update equipment usage: ${deleteResult.error.message}`
      );
    }

    if (checkedRows.length > 0) {
      const insertResult = await supabaseServer
        .from("equipment_usage")
        .insert(checkedRows);

      if (insertResult.error) {
        throw new Error(
          `Failed to save equipment usage: ${insertResult.error.message}`
        );
      }
    }
  }

  revalidatePath("/job-costs");
}

// ---------- Employees (stored as Labor materials under the hood) ----------

export async function addEmployee(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const employeeName = cleanText(formData.get("employee_name"));
  const hourlyRate = cleanNumber(formData.get("hourly_rate"));

  if (!employeeName) {
    throw new Error("Employee name is required.");
  }

  const { data, error } = await supabaseServer
    .from("materials")
    .insert({
      name: `Labor - ${employeeName}`,
      unit_label: "hour",
      unit_cost: hourlyRate,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to add employee: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "create",
    entityType: "employee_rate",
    entityId: data?.id ?? null,
    entityLabel: employeeName,
    after: { employee_name: employeeName, hourly_rate: hourlyRate },
  });

  revalidatePath("/employees");
  revalidatePath("/job-costs");
}

export async function updateEmployee(
  id: string,
  formData: FormData
): Promise<void> {
  const actor = await getCurrentUser();
  const employeeName = cleanText(formData.get("employee_name"));
  const hourlyRate = cleanNumber(formData.get("hourly_rate"));

  if (!employeeName) {
    throw new Error("Employee name is required.");
  }

  const { data: beforeRow } = await supabaseServer
    .from("materials")
    .select("name, unit_cost")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer
    .from("materials")
    .update({
      name: `Labor - ${employeeName}`,
      unit_cost: hourlyRate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update employee: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "update",
    entityType: "employee_rate",
    entityId: id,
    entityLabel: employeeName,
    before: beforeRow
      ? {
          employee_name: beforeRow.name?.replace(/^Labor - /, "") ?? null,
          hourly_rate: beforeRow.unit_cost,
        }
      : null,
    after: { employee_name: employeeName, hourly_rate: hourlyRate },
  });

  revalidatePath("/employees");
  revalidatePath("/job-costs");
}

export async function deleteEmployee(id: string): Promise<void> {
  const actor = await getCurrentUser();

  const { data: before } = await supabaseServer
    .from("materials")
    .select("name, unit_cost")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseServer.from("materials").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to delete employee: ${error.message}`);
  }

  await recordAuditLog({
    actor,
    action: "delete",
    entityType: "employee_rate",
    entityId: id,
    entityLabel: before?.name?.replace(/^Labor - /, "") ?? null,
    before: before
      ? {
          employee_name: before.name?.replace(/^Labor - /, "") ?? null,
          hourly_rate: before.unit_cost,
        }
      : null,
  });

  revalidatePath("/employees");
  revalidatePath("/job-costs");
}


// ---------- Visit-based job cost entry (Phase 2: replaces invoice-based entry) ----------

export async function saveVisitCosts(formData: FormData): Promise<void> {
  const parsedUsageRows: {
    jobber_visit_id: string;
    material_id: string;
    quantity_used: number;
  }[] = [];

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^usage\[(.+?)\]\[(.+?)\]$/);

    if (!match) {
      continue;
    }

    const jobberVisitId = match[1];
    const materialId = match[2];
    const quantity = parseQuantity(value);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    parsedUsageRows.push({
      jobber_visit_id: jobberVisitId,
      material_id: materialId,
      quantity_used: quantity,
    });
  }

  if (parsedUsageRows.length > 0) {
    const materialIds = Array.from(
      new Set(parsedUsageRows.map((row) => row.material_id))
    );

    const materialsResult = await supabaseServer
      .from("materials")
      .select("id, unit_cost")
      .in("id", materialIds);

    if (materialsResult.error) {
      throw new Error(
        `Failed to load material rates: ${materialsResult.error.message}`
      );
    }

    const unitCostMap = new Map<string, number>(
      (materialsResult.data ?? []).map((material) => [
        material.id as string,
        Number(material.unit_cost ?? 0),
      ])
    );

    const usageRows = parsedUsageRows.map((row) => ({
      jobber_visit_id: row.jobber_visit_id,
      material_id: row.material_id,
      quantity_used: row.quantity_used,
      unit_cost_at_time: unitCostMap.get(row.material_id) ?? 0,
    }));

    const usageResult = await supabaseServer
      .from("visit_material_usage")
      .upsert(usageRows, { onConflict: "jobber_visit_id,material_id" });

    if (usageResult.error) {
      throw new Error(
        `Failed to save visit material usage: ${usageResult.error.message}`
      );
    }
  }

  const pageVisitIdsRaw = formData.get("page_visit_ids");
  const pageVisitIds =
    typeof pageVisitIdsRaw === "string" && pageVisitIdsRaw
      ? pageVisitIdsRaw.split(",").filter(Boolean)
      : [];

  const pageEquipmentIdsRaw = formData.get("page_equipment_ids");
  const pageEquipmentIds =
    typeof pageEquipmentIdsRaw === "string" && pageEquipmentIdsRaw
      ? pageEquipmentIdsRaw.split(",").filter(Boolean)
      : [];

  if (pageVisitIds.length > 0 && pageEquipmentIds.length > 0) {
    const checkedRows: { jobber_visit_id: string; equipment_id: string }[] = [];

    for (const [key, value] of formData.entries()) {
      const match = key.match(/^equipment\[(.+?)\]\[(.+?)\]$/);

      if (!match) {
        continue;
      }

      if (value !== "1") {
        continue;
      }

      checkedRows.push({
        jobber_visit_id: match[1],
        equipment_id: match[2],
      });
    }

    const deleteResult = await supabaseServer
      .from("visit_equipment_usage")
      .delete()
      .in("jobber_visit_id", pageVisitIds)
      .in("equipment_id", pageEquipmentIds);

    if (deleteResult.error) {
      throw new Error(
        `Failed to update equipment usage: ${deleteResult.error.message}`
      );
    }

    if (checkedRows.length > 0) {
      const insertResult = await supabaseServer
        .from("visit_equipment_usage")
        .insert(checkedRows);

      if (insertResult.error) {
        throw new Error(
          `Failed to save equipment usage: ${insertResult.error.message}`
        );
      }
    }
  }

  revalidatePath("/job-costs");
  revalidatePath("/schedule");
}
