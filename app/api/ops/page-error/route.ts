// Looks up the real error behind a crash screen's digest number, for
// admins only -- called by app/(platform)/error.tsx. Everyone else gets
// a 403 and that screen simply shows nothing extra. See
// lib/pageErrors.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getPageErrorByDigest } from "@/lib/pageErrors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const digest = (request.nextUrl.searchParams.get("digest") ?? "").trim();

  if (!digest) {
    return NextResponse.json({ found: false });
  }

  const record = await getPageErrorByDigest(digest);

  return NextResponse.json(record ? { found: true, ...record } : { found: false });
}
