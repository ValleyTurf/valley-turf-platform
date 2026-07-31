import { NextRequest, NextResponse } from "next/server";
import { consumePortalLoginToken } from "@/lib/portalLoginTokens";
import {
  createPortalSessionToken,
  PORTAL_SESSION_COOKIE_NAME,
  PORTAL_SESSION_MAX_AGE_SECONDS,
} from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/portal/login?result=expired", request.url)
    );
  }

  const consumed = await consumePortalLoginToken(token);

  if (!consumed) {
    return NextResponse.redirect(
      new URL("/portal/login?result=expired", request.url)
    );
  }

  const sessionToken = await createPortalSessionToken({
    jobberClientId: consumed.jobberClientId,
    email: consumed.email,
    name: consumed.name,
  });

  const response = NextResponse.redirect(new URL("/portal", request.url));

  response.cookies.set(PORTAL_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: PORTAL_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
