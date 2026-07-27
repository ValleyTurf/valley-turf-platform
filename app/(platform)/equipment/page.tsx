import { redirect } from "next/navigation";

// Equipment was consolidated into the unified Materials & Costs page —
// this stays as a redirect so any existing bookmarks/links still resolve.
export default function EquipmentPage() {
  redirect("/materials");
}
