"use server";

// Public Server Action backing app/confirm/[token] -- same unguessable-
// token trust model as /q/[token] and /pay/[token] (no session/cookie
// check; see proxy.ts's PUBLIC_PATHS). Redirects back to the same page
// with a query param rather than returning a value, since the page is a
// plain <form action>, not a client component with useTransition.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { confirmVisitByToken } from "@/lib/visitConfirmation";

export async function confirmVisit(token: string): Promise<void> {
  const result = await confirmVisitByToken(token);

  if (!result.ok) {
    redirect(`/confirm/${encodeURIComponent(token)}?error=1`);
  }

  // The checkmark on Schedule/My Day reads jobber_visits fresh on every
  // load (force-dynamic), so this is mostly to cover any cached fetch --
  // cheap and harmless either way.
  revalidatePath("/schedule");
  revalidatePath("/my-day");

  redirect(`/confirm/${encodeURIComponent(token)}`);
}
