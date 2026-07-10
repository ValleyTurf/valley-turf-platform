import type { ReactNode } from "react";
import Sidebar from "@/app/components/layout/Sidebar";

export default function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f5f4ef]">
      <Sidebar />

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}