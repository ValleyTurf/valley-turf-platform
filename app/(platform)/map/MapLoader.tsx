"use client";

import dynamic from "next/dynamic";

const MapClient = dynamic(() => import("./MapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[#6b705c]">
      Loading map...
    </div>
  ),
});

export default function MapLoader() {
  return <MapClient />;
}
