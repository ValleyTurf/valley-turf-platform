// X-Twilio-Signature check: base64(HMAC-SHA1(authToken, url + sorted
// "key+value" concatenation of every POST param)). Shared by the Twilio
// webhooks that are added from now on; the two older inbound routes keep
// their own copies.
import crypto from "crypto";

export function verifyTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Record<string, string>,
  signature: string
): boolean {
  let data = fullUrl;

  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  const expectedBuffer = Buffer.from(expected, "base64");
  const providedBuffer = Buffer.from(signature, "base64");

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}
