"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export async function addDoorHangerDrop(
  latitude: number,
  longitude: number,
  notes: string | null
): Promise<void> {
  const { error } = await supabaseServer.from("door_hanger_drops").insert({
    latitude,
    longitude,
    status: "door_hanger",
    notes: notes || null,
  });

  if (error) {
    throw new Error(`Unable to save door hanger drop: ${error.message}`);
  }

  revalidatePath("/map");
}

export async function updateDoorHangerStatus(
  id: string,
  status: "door_hanger" | "lead"
): Promise<void> {
  const { error } = await supabaseServer
    .from("door_hanger_drops")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`Unable to update door hanger status: ${error.message}`);
  }

  revalidatePath("/map");
}

export async function deleteDoorHangerDrop(id: string): Promise<void> {
  const { error } = await supabaseServer
    .from("door_hanger_drops")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Unable to delete door hanger drop: ${error.message}`);
  }

  revalidatePath("/map");
}
