// Pure side of the business details (see lib/business.ts for where they
// are stored and read): defaults, phone formatting, and validating what
// gets typed into Settings > Business Details.

export type BusinessInput = {
  name: string;
  phoneDigits: string;
  website: string;
  ownerFirstName: string;
};

export type Business = BusinessInput & {
  // 480-331-4596, the form used inside texts and emails.
  phoneDashed: string;
  // (480) 331-4596, the form used on invoices and the website.
  phoneDisplay: string;
};

export const DEFAULT_BUSINESS_INPUT: BusinessInput = {
  name: "Valley Turf Revival",
  phoneDigits: "4803314596",
  website: "valleyturfrevival.com",
  ownerFirstName: "Ryan",
};

export function buildBusiness(input: BusinessInput): Business {
  const d = input.phoneDigits;

  return {
    ...input,
    phoneDashed: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`,
    phoneDisplay: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
  };
}

// Any way of typing a US number -> ten digits, or null when it is not one.
export function normalizePhoneDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  return /^[0-9]{10}$/.test(digits) ? digits : null;
}

// "https://www.Example.com/" -> "www.example.com" (no scheme, no slash).
export function normalizeWebsite(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function validateBusinessInput(raw: {
  name: string;
  phone: string;
  website: string;
  ownerFirstName: string;
}): { ok: true; value: BusinessInput } | { ok: false; error: string } {
  const name = raw.name.trim();
  const ownerFirstName = raw.ownerFirstName.trim();
  const phoneDigits = normalizePhoneDigits(raw.phone);
  const website = normalizeWebsite(raw.website);

  if (!name) return { ok: false, error: "Enter the business name." };
  if (name.length > 80) return { ok: false, error: "That business name is too long." };
  // The name goes into HTML emails as typed.
  if (/[<>]/.test(name) || /[<>]/.test(ownerFirstName)) {
    return { ok: false, error: "Names cannot contain < or >." };
  }
  if (!phoneDigits) {
    return { ok: false, error: "Enter a 10 digit phone number." };
  }
  if (!website || !website.includes(".") || /\s/.test(website)) {
    return { ok: false, error: "Enter the website, like example.com." };
  }
  if (!ownerFirstName) return { ok: false, error: "Enter the first name that signs quotes." };
  if (ownerFirstName.length > 40) return { ok: false, error: "That name is too long." };

  return { ok: true, value: { name, phoneDigits, website, ownerFirstName } };
}
