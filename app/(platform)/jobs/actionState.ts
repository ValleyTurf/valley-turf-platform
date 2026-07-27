// Plain (non-"use server") module for the useActionState initial value —
// same reasoning as app/(platform)/quotes/actionState.ts: a "use server"
// file may only export async functions, so this const lives separately
// from actions.ts.
export type ActionState = { error: string | null };

export const initialActionState: ActionState = { error: null };
