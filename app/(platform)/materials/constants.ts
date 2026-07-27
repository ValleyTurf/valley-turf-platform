// Shared between AddCostInputForm.tsx (the "Overhead Cost" add fields) and
// the Current Overhead Costs row editor on this page — moved out of
// costs/page.tsx when Materials/Labor Rates/Equipment/Overhead Costs were
// consolidated onto one page, since both places need the exact same list.
export const OVERHEAD_CATEGORY_OPTIONS = [
  "Software",
  "Facilities",
  "Marketing",
  "Insurance",
  "Professional Services",
  "Utilities",
  "Equipment",
  "Other",
];
