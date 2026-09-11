"use server";

// Public server action backing app/rate/[token]/page.tsx's Confirm
// button -- see lib/invoiceRatings.ts for why this is a deliberate
// second step rather than recording the rating straight off the email's
// star links.
import { redirect } from "next/navigation";
import { submitInvoiceRating } from "@/lib/invoiceRatings";

export async function submitRating(
  token: string,
  score: number
): Promise<void> {
  const result = await submitInvoiceRating(token, score);

  if (!result.ok) {
    redirect(`/rate/${token}?error=${encodeURIComponent(result.error)}`);
  }

  // A genuine 5-star continues straight on to the real Google review
  // page -- the same place the old static "Leave a review" button in
  // the invoice email used to go. Anything else lands on the internal
  // thank-you page instead.
  if (result.routeToGoogleUrl) {
    redirect(result.routeToGoogleUrl);
  }

  redirect(`/rate/${token}?done=1`);
}
