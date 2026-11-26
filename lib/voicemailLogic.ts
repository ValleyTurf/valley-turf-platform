// Pure helpers for voicemail on the business number.
import { escapeXml } from "@/lib/outboundCallLogic";

// How long the business phone rings before the call goes to voicemail. Kept
// shorter than most carriers' own voicemail pickup so the CRM catches it.
export const VOICEMAIL_RING_SECONDS = 20;
export const VOICEMAIL_MAX_SECONDS = 120;
// Recordings shorter than this are hang-ups, not messages.
export const VOICEMAIL_MIN_SECONDS = 2;

export function voicemailGreeting(businessName: string): string {
  return `You've reached ${businessName}. We can't take your call right now. Please leave a message after the beep and we'll call you back.`;
}

export function voicemailTwiml(params: { greeting: string; actionUrl: string }): string {
  return (
    `<Response><Say>${escapeXml(params.greeting)}</Say>` +
    `<Record maxLength="${VOICEMAIL_MAX_SECONDS}" playBeep="true" ` +
    `action="${escapeXml(params.actionUrl)}" method="POST" />` +
    `<Say>We did not receive a message. Goodbye.</Say></Response>`
  );
}

// Twilio statuses where nobody picked up and the caller should get voicemail.
export function shouldTakeVoicemail(dialStatus: string | undefined): boolean {
  return dialStatus === "no-answer" || dialStatus === "busy" || dialStatus === "failed" || dialStatus === "canceled";
}

export function isUsableRecording(durationSeconds: string | number | undefined): boolean {
  return Number(durationSeconds ?? 0) >= VOICEMAIL_MIN_SECONDS;
}

export function isValidRecordingSid(value: string | null | undefined): value is string {
  return typeof value === "string" && /^RE[0-9a-fA-F]{32}$/.test(value);
}

export function formatVoicemailLength(durationSeconds: string | number | undefined): string {
  const total = Math.max(0, Math.round(Number(durationSeconds ?? 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
