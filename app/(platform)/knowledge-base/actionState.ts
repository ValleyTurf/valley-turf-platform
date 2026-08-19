// Plain (non-"use server") module for the useActionState initial value —
// see app/(platform)/quotes/actionState.ts for why this can't live in
// actions.ts itself.
export type ActionState = { error: string | null };

export const initialActionState: ActionState = { error: null };
