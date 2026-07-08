import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valley Turf Revival Platform",
  description: "Marketing Platform for Valley Turf Revival",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F7F6F2] text-gray-900">
        <nav className="sticky top-0 z-50 border-b border-green-100 bg-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

            {/* Logo */}
            <a href="/" className="flex items-center gap-4">
              <Image
                src="/branding/logo.svg"
                alt="Valley Turf Revival"
                width={70}
                height={70}
                priority
              />

              <div>
                <h1 className="text-2xl font-bold text-[#0E3B2E]">
                  Valley Turf Revival
                </h1>

                <p className="text-sm font-medium text-[#D4A32A]">
                  Marketing Platform
                </p>
              </div>
            </a>

            {/* Navigation */}
            <div className="flex items-center gap-8 text-sm font-semibold">
              <a
                href="/dashboard"
                className="text-[#0E3B2E] transition hover:text-[#3F8F2F]"
              >
                Dashboard
              </a>

              <a
                href="/codes"
                className="text-[#0E3B2E] transition hover:text-[#3F8F2F]"
              >
                QR Library
              </a>

              <a
                href="/"
                className="text-[#0E3B2E] transition hover:text-[#3F8F2F]"
              >
                Website
              </a>
            </div>
          </div>
        </nav>

        <main>{children}</main>
      </body>
    </html>
  );
}