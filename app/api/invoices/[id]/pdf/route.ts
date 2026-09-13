// Lets staff open the actual invoice PDF for a native invoice (Ryan's
// request: the customer page's Native Invoices section only ever showed
// a line-item summary, with no way to see the real document that was
// emailed/texted to the customer). This regenerates the exact same PDF
// generateInvoicePdf produces at send time -- pdfkit output is
// deterministic from the invoice + line item rows, so there's no
// separate stored file to go stale; it always reflects the current data.
//
// This is also the "receipt" a customer got as an email attachment once
// paid (lib/stripeWebhookProcessor.ts's sendManualPaymentReceipt calls
// this exact same generateInvoicePdf(invoice, lineItems)) -- there's no
// separate receipt-shaped document anywhere in this app, so the customer
// page's Payment History section links here too for a native payment's
// "view receipt" (see that section's own comment).
//
// Gated the same way the customer page itself is -- any signed-in staff
// member, no extra permission tier -- since this is just another view of
// data already visible there.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getInvoiceById, getInvoiceLineItems } from "@/lib/invoices";
import { generateInvoicePdf } from "@/lib/invoicePdf";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { id } = await params;

  const invoice = await getInvoiceById(id);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const lineItems = await getInvoiceLineItems(id);
  const pdfBuffer = await generateInvoicePdf(invoice, lineItems);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // "inline" so it opens in a browser tab/viewer rather than forcing
      // a download -- staff are viewing it, not saving it, most of the
      // time. The filename still shows if they do choose to save it.
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
