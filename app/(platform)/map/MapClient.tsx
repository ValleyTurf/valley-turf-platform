"use client";

import { useState, useTransition } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapCustomer, MapDoorHanger } from "./page";
import {
  addDoorHangerDrop,
  updateDoorHangerStatus,
  deleteDoorHangerDrop,
} from "./actions";

const TIER_COLORS: Record<MapCustomer["tier"], string> = {
  current: "#16a34a",
  recent: "#f59e0b",
  past: "#6b7280",
  no_service: "#c9c3b3",
};

const TIER_LABELS: Record<MapCustomer["tier"], string> = {
  current: "Current",
  recent: "Recent",
  past: "Past",
  no_service: "No Service Done",
};

const DOOR_HANGER_COLORS: Record<MapDoorHanger["status"], string> = {
  door_hanger: "#9333ea",
  lead: "#2563eb",
};

function ClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

export default function MapClient({
  customers,
  doorHangers,
}: {
  customers: MapCustomer[];
  doorHangers: MapDoorHanger[];
}) {
  const [isPending, startTransition] = useTransition();
  const [addingAt, setAddingAt] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [notesInput, setNotesInput] = useState("");

  function handleMapClick(lat: number, lng: number) {
    setAddingAt({ lat, lng });
    setNotesInput("");
  }

  function handleConfirmAdd() {
    if (!addingAt) return;

    const { lat, lng } = addingAt;

    startTransition(async () => {
      await addDoorHangerDrop(lat, lng, notesInput.trim() || null);
      setAddingAt(null);
      setNotesInput("");
    });
  }

  function handleCancelAdd() {
    setAddingAt(null);
    setNotesInput("");
  }

  function handleToggleStatus(
    id: string,
    currentStatus: MapDoorHanger["status"]
  ) {
    const nextStatus =
      currentStatus === "door_hanger" ? "lead" : "door_hanger";

    startTransition(async () => {
      await updateDoorHangerStatus(id, nextStatus);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteDoorHangerDrop(id);
    });
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[33.35, -111.75]}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClickHandler onMapClick={handleMapClick} />

        {customers.map((customer) => (
          <CircleMarker
            key={customer.id}
            center={[customer.latitude, customer.longitude]}
            radius={7}
            pathOptions={{
              color: "white",
              weight: 1.5,
              fillColor: TIER_COLORS[customer.tier],
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <p style={{ fontWeight: "bold" }}>{customer.name}</p>
              <p style={{ fontSize: "0.85rem" }}>
                {TIER_LABELS[customer.tier]}
              </p>
            </Popup>
          </CircleMarker>
        ))}

        {doorHangers.map((drop) => (
          <CircleMarker
            key={drop.id}
            center={[drop.latitude, drop.longitude]}
            radius={8}
            pathOptions={{
              color: "white",
              weight: 1.5,
              fillColor: DOOR_HANGER_COLORS[drop.status],
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <p style={{ fontWeight: "bold" }}>
                {drop.status === "door_hanger"
                  ? "Door Hanger Hung"
                  : "Moved to Lead"}
              </p>
              {drop.notes && (
                <p style={{ fontSize: "0.85rem" }}>{drop.notes}</p>
              )}
              <div
                style={{
                  marginTop: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <button
                  onClick={() => handleToggleStatus(drop.id, drop.status)}
                  disabled={isPending}
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    color: "#2563eb",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {drop.status === "door_hanger"
                    ? "Mark as Lead"
                    : "Mark as Door Hanger"}
                </button>
                <button
                  onClick={() => handleDelete(drop.id)}
                  disabled={isPending}
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                    color: "#dc2626",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Remove Pin
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {addingAt && (
          <CircleMarker
            center={[addingAt.lat, addingAt.lng]}
            radius={8}
            pathOptions={{
              color: "white",
              weight: 1.5,
              fillColor: "#9333ea",
              fillOpacity: 0.6,
            }}
          />
        )}
      </MapContainer>

      {addingAt && (
        <div className="absolute bottom-4 left-1/2 z-[1000] w-80 -translate-x-1/2 rounded-2xl bg-white p-4 shadow-lg">
          <p className="text-sm font-bold text-[#174734]">
            Drop a door hanger pin here?
          </p>
          <textarea
            value={notesInput}
            onChange={(event) => setNotesInput(event.target.value)}
            placeholder="Optional note (e.g. address, gate code)"
            rows={2}
            className="mt-2 w-full rounded-lg border border-[#d9d4c6] p-2 text-sm outline-none focus:border-[#d4af37]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={handleCancelAdd}
              className="rounded-lg border border-[#d9d4c6] px-3 py-1.5 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAdd}
              disabled={isPending}
              className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white"
            >
              {isPending ? "Saving..." : "Drop Pin"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
