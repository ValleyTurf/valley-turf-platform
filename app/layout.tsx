import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valley Turf Revival OS",
  description: "Business Operating System for Valley Turf Revival",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F7F6F2] text-gray-900">
        {children}
      </body>
    </html>
  );
}