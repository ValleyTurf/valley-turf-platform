import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

// Constant-time comparison so a mistyped password can't be brute-forced
// faster by timing how quickly the comparison fails. Buffers must be equal
// length for timingSafeEqual, so a length mismatch is treated as an
// immediate, safe failure rather than thrown.
function passwordsMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";

  if (
    typeof password !== "string" ||
    !adminPassword ||
    !passwordsMatch(password, adminPassword)
  ) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  const token = await createSessionToken();

  response.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
