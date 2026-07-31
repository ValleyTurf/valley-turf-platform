import { NextRequest, NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE_NAME } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/portal/login", request.url)
  );

  response.cookies.delete(PORTAL_SESSION_COOKIE_NAME);

  return response;
}
