import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyPassword } from "@/lib/passwords";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "staff";
  active: boolean;
};

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (typeof email !== "string" || typeof password !== "string" || !email) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from("users")
    .select("id, email, name, password_hash, role, active")
    .ilike("email", email.trim())
    .maybeSingle();

  const user = data as UserRow | null;

  // Same response whether the account doesn't exist, is deactivated, or
  // the password is wrong — don't let the login form leak which one it is.
  if (error || !user || !user.active || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  const token = await createSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  await supabaseServer
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  return response;
}
