import { redirect } from "next/navigation";

// Labor Rates was consolidated into the unified Materials & Costs page —
// this stays as a redirect so any existing bookmarks/links still resolve.
export default function EmployeesPage() {
  redirect("/materials");
}
