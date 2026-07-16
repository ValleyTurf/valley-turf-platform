import type { ReactNode } from "react";
import Sidebar from "@/app/components/layout/Sidebar";

export default function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4ef] md:flex-row">
      <Sidebar />

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
