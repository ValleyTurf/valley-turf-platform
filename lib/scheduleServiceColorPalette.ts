// Pure, client-safe half of lib/scheduleServiceColors.ts -- the fixed
// color palette plus the string-matching helpers around it. Split out
// so the Settings page's client component (ScheduleColorsManager.tsx,
// which needs the swatches to render a color picker) can import this
// directly instead of pulling in scheduleServiceColors.ts's
// "server-only" Supabase reads. See that file for the Supabase-backed
// half (ServiceColorRule, fetchServiceColorRules, etc.), which
// re-exports everything here so existing server-side importers don't
// need two import lines.
//
// Background: migration 104_schedule_service_colors.sql /
// /settings/schedule-colors -- Ryan (2026-11-09) asked for a menu to
// change which color each service type gets on the Schedule rather than
// needing a code change every time.

// Named colors, each pairing a Tailwind chip class (for the DOM) with the
// matching hex value (for Leaflet map pins, which take real CSS colors,
// not Tailwind classes -- and Tailwind's build-time scanner needs the
// class names written out literally rather than assembled with template
// strings, or they'd get purged from the production CSS). This is the
// full fixed palette a rule can pick from; adding an eleventh color
// still needs a code change here, but choosing which of these ten goes
// with which service no longer does.
export const NAMED_COLORS = {
  green: {
    chip: "bg-green-100 text-green-800 border border-green-300",
    hex: "#16a34a",
  },
  blue: {
    chip: "bg-blue-100 text-blue-800 border border-blue-300",
    hex: "#2563eb",
  },
  orange: {
    chip: "bg-orange-100 text-orange-800 border border-orange-300",
    hex: "#ea580c",
  },
  sky: {
    chip: "bg-sky-100 text-sky-800 border border-sky-300",
    hex: "#0284c7",
  },
  purple: {
    chip: "bg-purple-100 text-purple-800 border border-purple-300",
    hex: "#9333ea",
  },
  lime: {
    chip: "bg-lime-100 text-lime-800 border border-lime-300",
    hex: "#65a30d",
  },
  yellow: {
    chip: "bg-yellow-100 text-yellow-800 border border-yellow-300",
    hex: "#ca8a04",
  },
  pink: {
    chip: "bg-pink-100 text-pink-800 border border-pink-300",
    hex: "#db2777",
  },
  rose: {
    chip: "bg-rose-100 text-rose-800 border border-rose-300",
    hex: "#e11d48",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    hex: "#059669",
  },
} as const;

export type NamedColorKey = keyof typeof NAMED_COLORS;

export const NAMED_COLOR_KEYS = Object.keys(NAMED_COLORS) as NamedColorKey[];

export function isNamedColorKey(value: string): value is NamedColorKey {
  return Object.prototype.hasOwnProperty.call(NAMED_COLORS, value);
}

export type ServiceColorRule = {
  id: string;
  sortOrder: number;
  label: string;
  keywords: string[];
  colorKey: NamedColorKey;
  isDefault: boolean;
};

// Same normalization schedule/page.tsx's own visitServiceLabel-adjacent
// code always used: lowercased, hyphens/en-dashes/em-dashes collapsed to
// spaces, runs of whitespace collapsed to one space. Applied to both the
// visit's service label at match time and each rule's keywords at save
// time, so "Bi-Monthly" and "bimonthly" keywords behave the same way
// small wording differences in the Jobber title do.
export function normalizeServiceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Turns the Settings page's free-text "match words" field (comma or
// newline separated, e.g. "full, clean, initial") into a normalized
// keyword array ready to store -- every entry must match for the rule to
// apply, same AND semantics the old hardcoded .test() functions used.
export function parseServiceColorKeywords(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((part) => normalizeServiceText(part))
    .filter((part) => part.length > 0);
}

// Same "checked in order, first match wins, fall through to the default
// row" logic the old hardcoded SERVICE_COLOR_RULES array had -- just
// reading the rules from a table instead of a literal array. `label`
// should already be the stripped service name (see each page's own
// visitServiceLabel), not the raw Jobber visit title.
export function classifyServiceLabel(
  label: string,
  rules: ServiceColorRule[]
): { chip: string; hex: string; colorKey: NamedColorKey } {
  const normalized = normalizeServiceText(label);

  const match = rules.find(
    (rule) =>
      !rule.isDefault &&
      rule.keywords.length > 0 &&
      rule.keywords.every((keyword) => normalized.includes(keyword))
  );

  const fallback = rules.find((rule) => rule.isDefault);
  const colorKey = match?.colorKey ?? fallback?.colorKey ?? "emerald";
  const color = NAMED_COLORS[colorKey];

  return { chip: color.chip, hex: color.hex, colorKey };
}
