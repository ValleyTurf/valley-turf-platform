// Plays a voicemail for signed-in staff. Twilio keeps recordings behind the
// account's credentials, so this fetches the audio server-side and streams
// it to the page's audio player (with Range support so phones can seek).
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { isValidRecordingSid } from "@/lib/voicemailLogic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordingSid: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { recordingSid } = await params;

  if (!isValidRecordingSid(recordingSid)) {
    return NextResponse.json({ error: "Invalid recording." }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio is not configured." }, { status: 500 });
  }

  const upstream = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`,
    { headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` } }
  );

  if (!upstream.ok) {
    return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  }

  const audio = Buffer.from(await upstream.arrayBuffer());
  const total = audio.length;
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;

  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : total - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(total - 1, end);

    if (start <= end) {
      return new NextResponse(new Uint8Array(audio.subarray(start, end + 1)), {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(end - start + 1),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new NextResponse(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
