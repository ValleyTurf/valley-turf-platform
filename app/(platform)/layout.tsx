import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/app/components/layout/Sidebar";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions, isPathAllowedForRole } from "@/lib/permissions";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, permissions, headerList] = await Promise.all([
    getCurrentUser(),
    getRolePermissions(),
    headers(),
  ]);

  // proxy.ts (Edge-like runtime, can't talk to Supabase) only checks
  // whether a session exists — the actual role/section permission gate
  // happens here instead, in a real Node.js server component, using the
  // x-pathname header proxy.ts sets on every request.
  if (user && user.role !== "admin") {
    const pathname = headerList.get("x-pathname");

    if (pathname && !isPathAllowedForRole(pathname, user.role, permissions)) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4ef] md:flex-row">
      <Sidebar user={user} permissions={permissions} />

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
