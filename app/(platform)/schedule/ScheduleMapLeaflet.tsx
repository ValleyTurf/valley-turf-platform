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
import type { SchedulePin } from "./types";

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

export default function ScheduleMapLeaflet({
  pins,
  selectedId,
  onSelectPin,
}: {
  pins: SchedulePin[];
  selectedId: string | null;
  onSelectPin: (id: string) => void;
}) {
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

      {pins.map((pin) => {
        const isSelected = pin.id === selectedId;

        return (
          <CircleMarker
            key={pin.id}
            center={[pin.lat, pin.lng]}
            radius={isSelected ? 12 : 8}
            pathOptions={{
              color: isSelected ? "#d4af37" : "white",
              weight: isSelected ? 3 : 1.5,
              fillColor: pin.color,
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () => onSelectPin(pin.id),
            }}
          >
            <Popup>
              <p style={{ fontWeight: "bold" }}>{pin.name}</p>
              <p style={{ fontSize: "0.85rem" }}>{pin.dateTimeShort}</p>
              <p
                style={{
                  fontSize: "0.8rem",
                  marginTop: "2px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "9999px",
                    backgroundColor: pin.color,
                  }}
                />
                {pin.serviceLabel}
              </p>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
