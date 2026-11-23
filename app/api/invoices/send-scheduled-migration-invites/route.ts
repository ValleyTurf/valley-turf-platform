// Sends queued "save a card" migration invites (the "Send at 9am" button on
// /invoices/migration). Runs daily at 9:05am Phoenix; see
// lib/nativeMigrationSchedule.ts.
import { NextResponse } from "next/server";
import { processDueBatches } from "@/lib/nativeMigrationSchedule";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await processDueBatches();
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error("Scheduled migration invites failed:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Scheduled migration invites failed.",
      },
      { status: 500 }
    );
  }
}
