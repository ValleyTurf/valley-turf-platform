import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const redirectUri = process.env.JOBBER_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error: "Missing Jobber environment variables",
        hasClientId: Boolean(clientId),
        hasRedirectUri: Boolean(redirectUri),
      },
      { status: 500 }
    );
  }

  const url = new URL("https://api.getjobber.com/api/oauth/authorize");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");

  return NextResponse.redirect(url);
}