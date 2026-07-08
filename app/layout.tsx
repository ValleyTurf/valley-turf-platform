import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valley Turf Revival Platform",
  description: "QR tracking and marketing dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b bg-white px-6 py-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <a href="/" className="text-xl font-bold text-green-950">
              Valley Turf Revival
            </a>

            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <a href="/dashboard" className="text-green-900 hover:underline">
                Dashboard
              </a>
              <a href="/codes" className="text-green-900 hover:underline">
                QR Codes
              </a>
              <a href="/r/truck" className="text-green-900 hover:underline">
                Test Truck QR
              </a>
            </div>
          </div>
        </nav>

        {children}
      </body>
    </html>
  );
}