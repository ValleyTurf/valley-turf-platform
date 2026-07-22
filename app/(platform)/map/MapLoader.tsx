"use client";

import dynamic from "next/dynamic";
import type { MapCustomer, MapDoorHanger } from "./page";

const MapClient = dynamic(() => import("./MapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[#6b705c]">
      Loading map...
    </div>
  ),
});

export default function MapLoader({
  customers,
  doorHangers,
}: {
  customers: MapCustomer[];
  doorHangers: MapDoorHanger[];
}) {
  return <MapClient customers={customers} doorHangers={doorHangers} />;
}
