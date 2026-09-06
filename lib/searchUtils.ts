// Shared by every page/route that drops a raw user-typed search term into
// a PostgREST `.or()` filter string (Customers, Job Costs, Quotes,
// Invoices, and the /api/customers/search typeahead) -- was copy-pasted
// identically into each of those before this file existed. One copy now,
// so a future fix (or a new search surface) doesn't have to remember to
// touch N places.
//
// PostgREST's `.or()` takes a comma-separated list of "column.op.value"
// clauses, and value itself can contain ilike wildcards (%, _) or
// characters that would otherwise be parsed as clause syntax (`,`, `(`,
// `)`) -- all of those need escaping so a search term containing them is
// treated as a literal substring, not filter syntax or an unintended
// wildcard.
export function escapeSearchValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
