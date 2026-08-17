import { redirect } from "next/navigation";

// Landing spot right after login (and for anyone hitting the bare "/"
// URL). Used to be /dashboard, but that's office-desk analytics — My
// Day (today's stops, clock in/out, etc.) is what everyone, admin
// included, actually wants to see first thing. Staff already ended up
// here anyway since /dashboard sits behind general_access, which they
// don't have by default (see the redirect in app/(platform)/layout.tsx)
// — this just makes it the default for admins too instead of a
// consequence of a permission gate.
export default function HomePage() {
  redirect("/my-day");
}