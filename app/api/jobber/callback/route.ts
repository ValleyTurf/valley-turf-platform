import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { success: false, error: "Missing authorization code" },
      { status: 400 }
    );
  }

  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;
  const redirectUri = process.env.JOBBER_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { success: false, error: "Missing Jobber environment variables" },
      { status: 500 }
    );
  }

  const tokenResponse = await fetch("https://api.getjobber.com/api/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return NextResponse.json(
      { success: false, error: tokenData },
      { status: tokenResponse.status }
    );
  }

  await supabaseServer.from("jobber_tokens").insert({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
  });

  return NextResponse.redirect(new URL("/?jobber=connected", request.url));
}