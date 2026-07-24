import type { ReactNode } from "react";
import Sidebar from "@/app/components/layout/Sidebar";
import { getCurrentUser } from "@/lib/currentUser";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4ef] md:flex-row">
      <Sidebar user={user} />

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
