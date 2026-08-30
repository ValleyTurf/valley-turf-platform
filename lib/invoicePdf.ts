// Invoice PDF rendering (Tier 1, Stage 4) -- builds a one-page PDF from a
// native Invoice (lib/invoices.ts) plus its line items, entirely in
// memory (no filesystem writes, no headless browser -- pdfkit draws
// vector text/shapes directly and needs no font embedding since it ships
// the 14 base PDF fonts, Helvetica among them).
//
// This can't be visually verified in the sandbox this was written in (no
// PDF renderer available) -- the pdfkit API used here is deliberately
// conservative (text/rect/moveTo-lineTo, no exotic layout features) to
// minimize surprise, but the first real invoice email should be opened
// and eyeballed once deployed.
import "server-only";
import PDFDocument from "pdfkit";
import type { Invoice } from "@/lib/invoices";

export type InvoicePdfLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const RULE_GRAY = "#d9dad2";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "--";

  // isoDate is a plain date ("2026-09-15"), not a timestamp -- parse it
  // as local rather than routing through `new Date(isoDate)` (which
  // treats a bare date as UTC midnight and can display a day early/late
  // depending on the server's timezone).
  const [year, month, day] = isoDate.split("-").map(Number);

  if (!year || !month || !day) return isoDate;

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateInvoicePdf(
  invoice: Invoice,
  lineItems: InvoicePdfLineItem[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc
      .fillColor(BRAND_GREEN)
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("Valley Turf Revival", 50, 50);

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(10)
      .font("Helvetica")
      .text("valleyturfrevival.com", 50, 74);

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(invoice.invoiceNumber, 50, 110);

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(10)
      .font("Helvetica")
      .text(`Issued: ${formatDate(invoice.issueDate)}`, 50, 132)
      .text(`Due: ${formatDate(invoice.dueDate)}`, 50, 146);

    // Bill to
    doc
      .fillColor(MUTED_GRAY)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("BILL TO", 350, 110);

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(11)
      .font("Helvetica")
      .text(invoice.customerName || "Valued customer", 350, 124);

    // Line items table
    const tableTop = 190;
    const columns = { description: 50, qty: 340, price: 410, total: 480 };

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("DESCRIPTION", columns.description, tableTop)
      .text("QTY", columns.qty, tableTop)
      .text("PRICE", columns.price, tableTop)
      .text("TOTAL", columns.total, tableTop);

    doc
      .moveTo(50, tableTop + 16)
      .lineTo(562, tableTop + 16)
      .strokeColor(RULE_GRAY)
      .stroke();

    let y = tableTop + 28;

    doc.font("Helvetica").fontSize(10).fillColor(BRAND_GREEN);

    for (const item of lineItems) {
      doc.text(item.description, columns.description, y, { width: 280 });
      doc.text(String(item.quantity), columns.qty, y);
      doc.text(formatCurrency(item.unitPrice), columns.price, y);
      doc.text(formatCurrency(item.lineTotal), columns.total, y);

      // Multi-line descriptions push the row taller -- measure the
      // description's actual rendered height rather than assuming one
      // line, so rows never overlap.
      const rowHeight = doc.heightOfString(item.description, { width: 280 });
      y += Math.max(rowHeight, 14) + 10;
    }

    doc
      .moveTo(50, y)
      .lineTo(562, y)
      .strokeColor(RULE_GRAY)
      .stroke();

    y += 14;

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(BRAND_GREEN)
      .text("Total", columns.price, y)
      .text(formatCurrency(invoice.total), columns.total, y);

    y += 40;

    if (invoice.message) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(MUTED_GRAY)
        .text(invoice.message, 50, y, { width: 512 });
      y += doc.heightOfString(invoice.message, { width: 512 }) + 20;
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED_GRAY)
      .text(
        "Thank you for your business. Questions about this invoice? Just reply to the email it came with.",
        50,
        720,
        { width: 512, align: "center" }
      );

    doc.end();
  });
}
