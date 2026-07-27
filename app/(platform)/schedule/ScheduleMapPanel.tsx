"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { SchedulePin } from "./ScheduleMapLeaflet";

// Leaflet touches `window` on import, so it can only ever run client-side —
// same ssr:false dynamic-import pattern as app/(platform)/map/MapLoader.tsx.
const ScheduleMapLeaflet = dynamic(() => import("./ScheduleMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[#6b705c]">
      Loading map...
    </div>
  ),
});

// A docked side panel, not a modal — matches how Jobber's own
// schedule/map split view works (calendar and map visible together, with
// a collapse control rather than an overlay that covers the calendar).
// `sticky` keeps it in view while the calendar column scrolls past it.
export default function ScheduleMapPanel({
  pins,
  title,
}: {
  pins: SchedulePin[];
  title: string;
}) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show map"
        className="sticky top-6 flex h-fit shrink-0 items-center gap-2 rounded-xl border border-[#d8d3c6] bg-white px-2 py-4 text-xs font-bold text-[#174734] shadow transition hover:border-[#d4af37]"
        style={{ writingMode: "vertical-rl" }}
      >
        Map ({pins.length})
      </button>
    );
  }

  return (
    <div className="sticky top-6 flex h-[calc(100vh-3rem)] w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e7e2d5] bg-white shadow-lg sm:w-[380px]">
      <div className="flex items-center justify-between border-b border-[#eee9dc] p-3">
        <p className="truncate text-sm font-bold text-[#174734]">{title}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide map"
          className="shrink-0 rounded-lg border border-[#d9d4c6] px-2 py-1 text-xs font-bold text-[#6b705c] transition hover:bg-[#f7f6f1]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1">
        {pins.length === 0 ? (
          <p className="p-4 text-sm text-[#6b705c]">
            No addresses to plot for this view yet.
          </p>
        ) : (
          <ScheduleMapLeaflet pins={pins} />
        )}
      </div>
    </div>
  );
}
