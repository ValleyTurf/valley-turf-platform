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
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { Invoice } from "@/lib/invoices";

export type InvoicePdfLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Free-text sub-list rendered as bullets under the description -- e.g.
  // a "Quarterly Cleaning 1000-1250" line item's included services
  // (Turf Fluff Up, Debris Removal, ...), pulled from Jobber's own
  // line-item description when available (lib/jobberJob.ts). Each
  // non-empty line becomes its own bullet; a line already starting with
  // "-" or "•" has that stripped so it isn't double-bulleted.
  details?: string | null;
};

function detailLines(details: string | null | undefined): string[] {
  if (!details) return [];

  return details
    .split("\n")
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

const BRAND_GREEN = "#174734";
const MUTED_GRAY = "#6b705c";
const RULE_GRAY = "#d9dad2";

// Same three contact points Ryan asked to see on the PDF (no business
// address). Phone/website are stable enough to hardcode -- they're
// already duplicated as literals in privacy-policy.md/terms-of-service.md
// -- but the email is genuinely unknown to this codebase (nothing sends
// customer mail from a literal address; lib/notifications.ts reads
// RESEND_FROM_EMAIL at send time and terms-of-service.md still has an
// "[insert business email]" placeholder), so it's read from an env var
// and the line simply omits it until Ryan sets one, same null-safe
// pattern as the invoice email's reviewUrl.
const BUSINESS_PHONE = "(480) 331-4596";
const BUSINESS_WEBSITE = "valleyturfrevival.com";

// Loaded once per cold start rather than per-PDF -- a 300x300 PNG is
// small, but there's no reason to hit the filesystem on every invoice.
// Falls back to null (header just skips the image) if the file is ever
// missing, so a bad deploy can't take down invoice generation entirely.
let cachedLogoBuffer: Buffer | null | undefined;

function loadLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;

  try {
    cachedLogoBuffer = fs.readFileSync(
      path.join(process.cwd(), "public", "branding", "logo.png")
    );
  } catch (error) {
    console.error("Could not load logo.png for invoice PDF:", error);
    cachedLogoBuffer = null;
  }

  return cachedLogoBuffer;
}

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

    // Header -- logo + wordmark + contact line on the left, matching the
    // invoice email's header. No business address per Ryan (phone/
    // website/email only).
    const logoBuffer = loadLogoBuffer();
    const nameX = logoBuffer ? 110 : 50;

    if (logoBuffer) {
      doc.image(logoBuffer, 50, 45, { height: 50 });
    }

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("Valley Turf Revival", nameX, 50);

    const contactLine = [BUSINESS_PHONE, BUSINESS_WEBSITE, process.env.BUSINESS_CONTACT_EMAIL]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join("   ·   ");

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(9)
      .font("Helvetica")
      .text(contactLine, nameX, 72);

    doc
      .moveTo(50, 108)
      .lineTo(562, 108)
      .strokeColor(BRAND_GREEN)
      .lineWidth(2)
      .stroke();

    // Amount due -- the callout Ryan specifically confirmed as "great" on
    // the redesigned email, mirrored here so the PDF leads with the same
    // number rather than burying it at the bottom of the line-items
    // table (which still gets its own Total row further down, for
    // anyone who wants the itemized math).
    doc
      .roundedRect(380, 122, 182, 64, 8)
      .fill(BRAND_GREEN);

    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("AMOUNT DUE", 396, 134, { characterSpacing: 1 });

    doc
      .fillColor("#ffffff")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(formatCurrency(invoice.total), 396, 150);

    // Invoice number / dates / bill-to, left column alongside the amount
    // due box.
    doc
      .fillColor(BRAND_GREEN)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(invoice.invoiceNumber, 50, 122);

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(10)
      .font("Helvetica")
      .text(`Issued: ${formatDate(invoice.issueDate)}`, 50, 144)
      .text(`Due: ${formatDate(invoice.dueDate)}`, 50, 158);

    doc
      .fillColor(MUTED_GRAY)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("BILL TO", 50, 182);

    doc
      .fillColor(BRAND_GREEN)
      .fontSize(11)
      .font("Helvetica")
      .text(invoice.customerName || "Valued customer", 50, 196);

    // Line items table
    const tableTop = 232;
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
      doc.font("Helvetica").fontSize(10).fillColor(BRAND_GREEN);
      doc.text(item.description, columns.description, y, { width: 280 });
      doc.text(String(item.quantity), columns.qty, y);
      doc.text(formatCurrency(item.unitPrice), columns.price, y);
      doc.text(formatCurrency(item.lineTotal), columns.total, y);

      // Multi-line descriptions push the row taller -- measure the
      // description's actual rendered height rather than assuming one
      // line, so rows never overlap.
      const rowHeight = doc.heightOfString(item.description, { width: 280 });
      y += Math.max(rowHeight, 14) + 4;

      // Included-services sub-list (e.g. a "Quarterly Cleaning
      // 1000-1250" line item's Turf Fluff Up / Debris Removal / ...
      // breakdown) -- smaller, muted, indented slightly under the
      // description so it visually nests under its parent line.
      const bullets = detailLines(item.details);
      if (bullets.length > 0) {
        doc.font("Helvetica").fontSize(9).fillColor(MUTED_GRAY);
        for (const bullet of bullets) {
          doc.text(`•  ${bullet}`, columns.description + 8, y, { width: 272 });
          y += Math.max(doc.heightOfString(`•  ${bullet}`, { width: 272 }), 12) + 2;
        }
        doc.font("Helvetica").fontSize(10).fillColor(BRAND_GREEN);
      }

      y += 6;
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
