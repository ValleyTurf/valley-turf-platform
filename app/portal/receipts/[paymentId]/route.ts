// Customer-facing payment receipt PDF. Lives under /portal so proxy.ts
// requires the portal session; the payment is looked up scoped to the
// signed-in customer's own client id, so a guessed id from another
// customer returns 404, never their receipt.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentPortalUser } from "@/lib/currentPortalUser";
import { getPortalPayment } from "@/lib/portalPayments";
import { generatePaymentReceiptPdf } from "@/lib/paymentReceiptPdf";
import { receiptNumber } from "@/lib/portalPaymentsLogic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const customer = await getCurrentPortalUser();

  if (!customer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { paymentId } = await params;
  const payment = await getPortalPayment(customer.jobberClientId, decodeURIComponent(paymentId));

  if (!payment) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const pdf = await generatePaymentReceiptPdf(payment, customer.name);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${receiptNumber(payment.id)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
