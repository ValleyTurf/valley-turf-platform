// Shared helpers for matching leads/scans to Jobber customers by contact info.
// Phone numbers and emails are entered inconsistently across sources (QR capture
// form, Jobber), so comparisons always go through these normalizers first.

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  if (digits.length !== 10) {
    return null;
  }

  return digits;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const trimmed = email.trim().toLowerCase();

  return trimmed || null;
}
