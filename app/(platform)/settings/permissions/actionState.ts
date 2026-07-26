// Plain (non-"use server") module for the useActionState initial value.
// Next.js requires that any file with a top-level "use server" directive
// export ONLY async functions — a const object like this one breaks the
// build ("A 'use server' file can only export async functions, found
// object.") if it lives in actions.ts instead. Keeping it here, separate
// from the server action functions themselves, avoids that entirely.
export type ActionState = { error: string | null };

export const initialActionState: ActionState = { error: null };
