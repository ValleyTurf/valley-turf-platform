// Shared parsing for the "Labor - {employee name}" synthetic material
// rows addEmployee()/updateEmployee() (app/(platform)/materials/actions.ts)
// create to represent an hourly rate as a materials-table row.
//
// The write side always uses a plain hyphen-minus ("Labor - Name"), but
// real data in this account has rows saved with an em dash instead
// ("Labor — Name") — likely from an earlier version of the naming
// convention, or a manual edit where "smart punctuation" swapped the
// character. Every previous read-side match (job-costs/page.tsx's timer
// prefill, job-costing-analytics/page.tsx's cost breakdown) checked for
// a literal " - " and silently matched zero rows for any employee whose
// name predates the switch — showing as $0 labor with no error anywhere.
//
// Matching here is dash-tolerant (hyphen, en dash, em dash, minus sign)
// so it works regardless of which character a given row happens to have,
// without needing to backfill/rename the existing data.
const LABOR_NAME_PATTERN = /^Labor\s*[-‐‑‒–—−]\s*(.+)$/;

// True if this material name represents an employee labor rate row,
// regardless of which dash character it was saved with.
export function isLaborMaterialName(name: string | null | undefined): boolean {
  return LABOR_NAME_PATTERN.test((name ?? "").trim());
}

// Extracts the employee name from a labor material name ("Labor — Ryan"
// -> "Ryan"), or null if this isn't a labor material row at all.
export function parseLaborEmployeeName(
  name: string | null | undefined
): string | null {
  const match = (name ?? "").trim().match(LABOR_NAME_PATTERN);
  return match ? match[1].trim() : null;
}

// Canonical form for *creating* new labor material rows — always a plain
// hyphen. addEmployee()/updateEmployee() already do this inline; exported
// here too so any future write path stays consistent by construction
// rather than by convention.
export function formatLaborMaterialName(employeeName: string): string {
  return `Labor - ${employeeName}`;
}
