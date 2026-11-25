// Pure helper (no server imports) so it can be unit tested.
export function dropVoidInvoices<T extends { jobber_invoice_id?: string | null }>(
  rows: T[],
  voidIds: Set<string>
): T[] {
  if (voidIds.size === 0) return rows;
  return rows.filter((row) => !(row.jobber_invoice_id && voidIds.has(row.jobber_invoice_id)));
}
