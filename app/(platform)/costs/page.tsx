import { redirect } from "next/navigation";

// Overhead Costs was consolidated into the unified Materials & Costs page —
// this stays as a redirect so any existing bookmarks/links still resolve.
// costs/actions.ts stays in place — the unified page still imports
// updateOverheadCost/deleteOverheadCost/addOverheadCost from it.
export default function CostsPage() {
  redirect("/materials");
}
