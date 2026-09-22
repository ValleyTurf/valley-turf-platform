// One-time diagnostic (2026-09-22). Ryan is getting "Admin access
// required" from the read-only diagnostic routes today, even while
// signed in (able to load My Day). requireAdmin() throws for any role
// other than exactly "admin" -- this route deliberately does NOT call
// requireAdmin/getCurrentUser's throwing wrapper, just echoes back
// whatever identity (or lack of one) proxy.ts's session check handed to
// this request, so it works no matter what role is (or isn't) attached
// to the current session and tells us which one it actually is.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  return NextResponse.json({
    signedIn: user !== null,
    id: user?.id ?? null,
    email: user?.email ?? null,
    name: user?.name ?? null,
    role: user?.role ?? null,
  });
}
