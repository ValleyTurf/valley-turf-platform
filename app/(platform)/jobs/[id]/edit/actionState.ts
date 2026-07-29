// Plain (non-"use server") module for useActionState's initial value —
// same reasoning as app/(platform)/jobs/actionState.ts: a "use server"
// file may only export async functions.
export type ActionState = { error: string | null };

export const initialActionState: ActionState = { error: null };
