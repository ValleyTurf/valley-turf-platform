import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valley Turf Revival OS",
  description: "Business Operating System for Valley Turf Revival",
  // Internal staff tool -- nothing here is meant to be publicly
  // discoverable. Without this, Google indexed the public /login page
  // (the redirect target for every signed-out visitor, see proxy.ts's
  // PUBLIC_PATHS) using this file's title/description, and it started
  // showing up in search results. robots.txt (app/robots.ts) tells
  // crawlers not to visit at all; this is the actual "drop it from
  // search results" signal even if a crawler finds the URL some other
  // way (e.g. a link) despite robots.txt.
  robots: {
    index: false,
    follow: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VTR OS",
  },
};

export const viewport: Viewport = {
  themeColor: "#174734",
  width: "device-width",
  initialScale: 1,
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
