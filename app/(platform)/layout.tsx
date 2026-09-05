import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/app/components/layout/Sidebar";
import ServiceWorkerRegister from "@/app/components/ServiceWorkerRegister";
import InstallPrompt from "@/app/components/InstallPrompt";
import CustomerTypeahead from "@/app/components/CustomerTypeahead";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, isPathAllowedForRole } from "@/lib/permissions";
import { getUnreadMessageCount } from "@/lib/contactHistory";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, permissions, headerList, unreadMessageCount] = await Promise.all([
    getCurrentUser(),
    getRolePermissions(),
    headers(),
    // Powers the "Messages" nav badge -- cheap indexed count query (see
    // migration 057's partial index), fine to run on every platform page
    // load alongside the permission checks this layout already does.
    getUnreadMessageCount(),
  ]);

  // proxy.ts (Edge-like runtime, can't talk to Supabase) only checks
  // whether a session exists — the actual role/section permission gate
  // happens here instead, in a real Node.js server component, using the
  // x-pathname header proxy.ts sets on every request.
  if (user && user.role !== "admin") {
    const pathname = headerList.get("x-pathname");

    if (pathname && !isPathAllowedForRole(pathname, user.role, permissions)) {
      // Not /dashboard — that's now behind general_access, which staff
      // don't have by default (see lib/permissionRules.ts). Redirecting
      // a blocked request to another blocked page would loop forever.
      // My Day has no entry in any gated prefix list, so it's always a
      // safe landing spot for every role.
      redirect("/my-day");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4ef] md:flex-row">
      <ServiceWorkerRegister />
      <InstallPrompt />

      <Sidebar
        user={user}
        permissions={permissions}
        unreadMessageCount={unreadMessageCount}
      />

      <div className="min-w-0 flex-1">
        {/* Global customer search -- sticky so it's reachable from any
            page without scrolling back up. Suggestions come from
            /api/customers/search; picking one jumps straight to that
            customer's page (see CustomerTypeahead's navigateOnSelect). */}
        <div className="sticky top-0 z-30 border-b border-[#e7e2d5] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <CustomerTypeahead
            placeholder="🔍 Search customers..."
            navigateOnSelect
            className="max-w-sm"
            inputClassName="w-full rounded-xl border border-[#d9d4c6] bg-white px-4 py-2 text-sm text-[#174734] outline-none transition placeholder:text-[#8b8d82] focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        </div>

        {children}
      </div>
    </div>
  );
}
