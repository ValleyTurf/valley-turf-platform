import type { ReactNode } from "react";
import Sidebar from "@/app/components/layout/Sidebar";
import { getCurrentUser } from "@/lib/currentUser";
import { getRolePermissions } from "@/lib/permissions";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, permissions] = await Promise.all([
    getCurrentUser(),
    getRolePermissions(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4ef] md:flex-row">
      <Sidebar user={user} permissions={permissions} />

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
