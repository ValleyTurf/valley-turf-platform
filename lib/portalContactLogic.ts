// Pure validation for the portal "My Info" page (no server imports).

export function cleanPortalEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed || null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

// Returns the 10 digits of a US number, or null if it is not one.
export function phoneDigits(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function formatPhone(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export type PrimaryContactInput = { email: string; phone: string };

export type PrimaryContactResult =
  | { ok: true; email: string | null; phone: string | null }
  | { ok: false; error: "invalid_email" | "invalid_phone" | "need_one" };

// Either field may be left blank (cleared), but at least one must remain
// so the customer can still be reached and sign in.
export function validatePrimaryContact(input: PrimaryContactInput): PrimaryContactResult {
  const email = cleanPortalEmail(input.email);
  const rawPhone = input.phone.trim();

  if (email && !isValidEmail(email)) return { ok: false, error: "invalid_email" };

  let phone: string | null = null;
  if (rawPhone) {
    const digits = phoneDigits(rawPhone);
    if (!digits) return { ok: false, error: "invalid_phone" };
    phone = formatPhone(digits);
  }

  if (!email && !phone) return { ok: false, error: "need_one" };

  return { ok: true, email, phone };
}

export type ExtraContactInput = {
  name: string;
  label: string;
  email: string;
  phone: string;
  receivesNotifications: boolean;
};

export type ExtraContactResult =
  | {
      ok: true;
      value: {
        contactName: string | null;
        label: string | null;
        email: string | null;
        phone: string | null;
        receivesNotifications: boolean;
      };
    }
  | { ok: false; error: "invalid_email" | "invalid_phone" | "need_one" };

export function validateExtraContact(input: ExtraContactInput): ExtraContactResult {
  const primary = validatePrimaryContact({ email: input.email, phone: input.phone });
  if (!primary.ok) return primary;

  return {
    ok: true,
    value: {
      contactName: input.name.trim().slice(0, 80) || null,
      label: input.label.trim().slice(0, 40) || null,
      email: primary.email,
      phone: primary.phone,
      receivesNotifications: input.receivesNotifications,
    },
  };
}

export const CONTACT_ERROR_TEXT: Record<string, string> = {
  invalid_email: "That email address doesn't look right. Please check it and try again.",
  invalid_phone: "Enter a 10-digit US phone number, like (480) 555-1234.",
  need_one: "Keep at least an email or a phone number so we can reach you.",
  conflict_email: "That email is already on another account. Send us a message and we'll sort it out.",
  conflict_phone: "That number is already on another account. Send us a message and we'll sort it out.",
  error: "Something went wrong saving that. Please try again.",
};

export const CONTACT_OK_TEXT: Record<string, string> = {
  saved: "Your contact info is updated.",
  contact_added: "Contact added.",
  contact_removed: "Contact removed.",
};
