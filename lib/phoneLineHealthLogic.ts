// Pure checks for the business phone line (Twilio number), shown on System
// Health. Takes what Twilio and the CRM report and says what is wrong.
import { toE164 } from "@/lib/outboundCallLogic";

export type PhoneLineFinding = { severity: "fail" | "warn"; message: string };

export type PhoneLineInput = {
  fromNumber: string | null;
  twilioReachable: boolean;
  numberFound: boolean;
  voiceCapable: boolean | null;
  voiceUrl: string | null;
  voiceMethod: string | null;
  smsUrl: string | null;
  balance: number | null;
  forwardNumbers: string[];
  savedCellCount: number;
  expectedVoiceUrl: string;
  expectedSmsPath: string;
};

export const LOW_BALANCE_WARN = 15;
export const LOW_BALANCE_FAIL = 5;

function normalizeUrl(url: string | null | undefined): string {
  return (url ?? "").trim().toLowerCase().replace(/\/+$/, "");
}

export function evaluatePhoneLine(input: PhoneLineInput): PhoneLineFinding[] {
  const findings: PhoneLineFinding[] = [];
  const from = toE164(input.fromNumber);

  if (!from) {
    return [{ severity: "fail", message: "The business phone number (TWILIO_FROM_NUMBER) is not set in Vercel." }];
  }

  if (!input.twilioReachable) {
    return [{ severity: "warn", message: "Could not reach Twilio to check the phone line." }];
  }

  if (!input.numberFound) {
    findings.push({ severity: "fail", message: `${from} was not found in this Twilio account.` });
  } else {
    if (input.voiceCapable === false) {
      findings.push({ severity: "fail", message: "The business number cannot make or receive calls." });
    }

    if (normalizeUrl(input.voiceUrl) !== normalizeUrl(input.expectedVoiceUrl)) {
      findings.push({
        severity: "fail",
        message: `Incoming calls are not pointed at the CRM. Twilio's "A call comes in" is ${input.voiceUrl ? input.voiceUrl : "not set"}; it should be ${input.expectedVoiceUrl}.`,
      });
    } else if ((input.voiceMethod ?? "POST").toUpperCase() !== "POST") {
      findings.push({ severity: "fail", message: 'Twilio\'s "A call comes in" must use HTTP POST.' });
    }

    const sms = normalizeUrl(input.smsUrl);
    if (sms && !sms.endsWith(input.expectedSmsPath)) {
      findings.push({
        severity: "warn",
        message: `Incoming texts go to ${input.smsUrl}, not the CRM's ${input.expectedSmsPath}.`,
      });
    }
  }

  if (input.balance !== null) {
    if (input.balance < LOW_BALANCE_FAIL) {
      findings.push({ severity: "fail", message: `Twilio balance is $${input.balance.toFixed(2)}. Calls and texts stop at $0.` });
    } else if (input.balance < LOW_BALANCE_WARN) {
      findings.push({ severity: "warn", message: `Twilio balance is $${input.balance.toFixed(2)}. Add funds or turn on auto-recharge.` });
    }
  }

  if (input.forwardNumbers.includes(from)) {
    findings.push({
      severity: "fail",
      message: "Incoming calls are set to forward to the business number itself, which would loop. Check ALERT_PHONE and the cell saved on the Account page.",
    });
  }

  if (input.savedCellCount === 0) {
    findings.push({
      severity: "warn",
      message: "No owner has saved a cell number on the Account page, so calls ring the alert phone setting instead.",
    });
  }

  return findings;
}
