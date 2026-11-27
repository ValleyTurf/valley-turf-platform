// Wording for the instant "we got your quote request" reply. Pure, so it
// is tested and easy to adjust in one place. Plain punctuation on
// purpose (no curly quotes or dashes) so it renders the same in every
// email app and on every phone.

export type LeadAckInput = {
  firstName: string | null;
  businessName: string;
  address: string | null;
  turfSizeRange: string | null;
  photoCount: number;
  notes: string | null;
};

function greetingName(firstName: string | null): string {
  const trimmed = firstName?.trim();
  return trimmed ? trimmed : "there";
}

export function leadAckText(input: LeadAckInput): string {
  return `Hi ${greetingName(input.firstName)}, thanks for requesting a quote from ${input.businessName}! We got your request and will send your quote within one business day. Questions? Just reply to this text.`;
}

export function leadAckEmail(input: LeadAckInput): { subject: string; body: string } {
  const details: string[] = [];

  if (input.address) details.push(`Service address: ${input.address}`);
  if (input.turfSizeRange) details.push(`Approximate turf size: ${input.turfSizeRange} sq ft`);
  if (input.photoCount > 0) {
    details.push(`Photos: ${input.photoCount} received`);
  }
  if (input.notes?.trim()) details.push(`Your notes: ${input.notes.trim()}`);

  const sections = [
    `Hi ${greetingName(input.firstName)},`,
    `Thanks for requesting a quote from ${input.businessName}. We received your request and will send your quote within one business day.`,
  ];

  if (details.length > 0) {
    sections.push(`Here is what we have so far:\n${details.join("\n")}`);
  }

  sections.push(
    "If anything looks wrong, or you want to add details like gate access or pets, just reply to this email.",
    `Thank you,\n${input.businessName}`
  );

  return {
    subject: "We got your quote request",
    body: sections.join("\n\n"),
  };
}
