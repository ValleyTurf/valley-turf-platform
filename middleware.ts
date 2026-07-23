import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/login",
  "/api/jobber/webhook",
  "/api/jobber/process-webhooks",
  "/api/scan-leads",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some(
    (path) =>
      pathname === path ||
      pathname.startsWith(`${path}/`)
  );

  const isPublicRedirect =
    pathname.startsWith("/r/");

  if (isPublicPath || isPublicRedirect) {
    return NextResponse.next();
  }

  const session =
    request.cookies.get("admin_session")?.value;

  if (session !== process.env.ADMIN_PASSWORD) {
    const loginUrl = new URL(
      "/login",
      request.url
    );

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};