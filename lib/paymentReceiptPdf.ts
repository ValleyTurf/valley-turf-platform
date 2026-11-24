// One-page payment receipt PDF for the customer portal. Same look as the
// invoice PDF (logo, brand green, contact line) but shows what was paid
// rather than what is owed. Built in memory with pdfkit.
import "server-only";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { getBusiness } from "@/lib/business";
import { receiptNumber, paymentStateLabel, type PortalPayment } from "@/lib/portalPaymentsLogic";

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const RULE_GRAY = "#d9dad2";

let cachedLogo: Buffer | null | undefined;

function loadLogo(): Buffer | null {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), "public", "branding", "logo.png"));
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function longDate(iso: string | null): string {
  if (!iso) return "--";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generatePaymentReceiptPdf(
  payment: PortalPayment,
  customerName: string
): Promise<Buffer> {
  const biz = await getBusiness();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const logo = loadLogo();
    const nameX = logo ? 110 : 50;
    if (logo) doc.image(logo, 50, 45, { height: 50 });

    doc.fillColor(BRAND_GREEN).fontSize(18).font("Helvetica-Bold").text(biz.name, nameX, 50);

    const contact = [biz.phoneDisplay, biz.website, process.env.BUSINESS_CONTACT_EMAIL]
      .filter((p): p is string => Boolean(p && p.trim()))
      .join("   ·   ");
    doc.fillColor(MUTED_GRAY).fontSize(9).font("Helvetica").text(contact, nameX, 72);

    doc.moveTo(50, 108).lineTo(562, 108).strokeColor(BRAND_GREEN).lineWidth(2).stroke();

    doc.fillColor(BRAND_GREEN).fontSize(16).font("Helvetica-Bold").text("PAYMENT RECEIPT", 50, 124);
    doc.fillColor(MUTED_GRAY).fontSize(10).font("Helvetica").text(`Receipt ${receiptNumber(payment.id)}`, 50, 146);

    doc.roundedRect(380, 122, 182, 64, 8).fill(BRAND_GREEN);
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold").text("AMOUNT PAID", 396, 134, { characterSpacing: 1 });
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text(money(payment.amount), 396, 150);

    doc.fillColor(MUTED_GRAY).fontSize(9).font("Helvetica-Bold").text("RECEIVED FROM", 50, 182);
    doc.fillColor(BRAND_GREEN).fontSize(11).font("Helvetica").text(customerName || "Valued customer", 50, 196);

    // Detail rows.
    const rows: Array<[string, string]> = [
      ["Date paid", longDate(payment.date)],
      ["Payment method", payment.methodLabel],
      ["For invoice", payment.invoiceNumber ? `#${payment.invoiceNumber}` : "--"],
      ["Status", paymentStateLabel(payment.state)],
    ];

    let y = 240;
    doc.moveTo(50, y - 10).lineTo(562, y - 10).strokeColor(RULE_GRAY).lineWidth(1).stroke();
    for (const [label, value] of rows) {
      doc.fillColor(MUTED_GRAY).fontSize(10).font("Helvetica").text(label, 50, y);
      doc.fillColor(BRAND_GREEN).fontSize(10).font("Helvetica-Bold").text(value, 250, y, { width: 312 });
      y += 24;
      doc.moveTo(50, y - 8).lineTo(562, y - 8).strokeColor(RULE_GRAY).lineWidth(1).stroke();
    }

    y += 8;
    const totals: Array<[string, string, boolean]> = [["Payment", money(payment.amount), false]];
    if (payment.tip > 0) totals.push(["Tip included", money(payment.tip), false]);
    if (payment.refundedAmount > 0) totals.push(["Refunded", `-${money(payment.refundedAmount)}`, false]);
    totals.push(["Net paid", money(Math.max(0, payment.amount - payment.refundedAmount)), true]);

    for (const [label, value, bold] of totals) {
      doc.fillColor(bold ? BRAND_GREEN : MUTED_GRAY).fontSize(bold ? 12 : 10).font(bold ? "Helvetica-Bold" : "Helvetica").text(label, 330, y);
      doc.text(value, 460, y, { width: 102, align: "right" });
      y += bold ? 24 : 18;
    }

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(9)
      .font("Helvetica")
      .text(`Thank you for choosing ${biz.name}. Questions about this payment? Just reply to us or call ${biz.phoneDisplay ?? "us"}.`, 50, 650, {
        width: 512,
        align: "center",
      });

    doc.end();
  });
}
