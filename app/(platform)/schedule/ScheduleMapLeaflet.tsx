"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type SchedulePin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  timeLabel: string;
};

// Phoenix-area fallback center — only used when there are no pins to fit
// bounds to (shouldn't normally happen since the panel hides itself when
// there's nothing to show, but keeps MapContainer from erroring either
// way).
const FALLBACK_CENTER: [number, number] = [33.35, -111.75];

function FitBoundsToPins({ pins }: { pins: SchedulePin[] }) {
  const map = useMap();

  useEffect(() => {
    if (pins.length === 0) return;

    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 13);
      return;
    }

    map.fitBounds(
      pins.map((pin) => [pin.lat, pin.lng] as [number, number]),
      { padding: [30, 30] }
    );
  }, [map, pins]);

  return null;
}

export default function ScheduleMapLeaflet({ pins }: { pins: SchedulePin[] }) {
  return (
    <MapContainer
      center={FALLBACK_CENTER}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBoundsToPins pins={pins} />

      {pins.map((pin) => (
        <CircleMarker
          key={pin.id}
          center={[pin.lat, pin.lng]}
          radius={8}
          pathOptions={{
            color: "white",
            weight: 1.5,
            fillColor: "#174734",
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <p style={{ fontWeight: "bold" }}>{pin.name}</p>
            <p style={{ fontSize: "0.85rem" }}>{pin.timeLabel}</p>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
