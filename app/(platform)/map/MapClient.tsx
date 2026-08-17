"use client";

import { useMemo, useState, useTransition } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polygon,
  Polyline,
  Popup,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapCustomer, MapDoorHanger } from "./page";
import { isPointInPolygon, type LatLngTuple } from "@/lib/pointInPolygon";
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
  const [actionError, setActionError] = useState<string | null>(null);

  // "Draw Area" tool — click points to trace a boundary, then count how
  // many customers/door-hangers/leads fall inside it. Entirely
  // client-side: every customer and door-hanger location is already
  // loaded into this component to render as markers, so counting is
  // just a point-in-polygon test (lib/pointInPolygon.ts) against data
  // that's already here — no new query needed. drawPoints is the
  // in-progress shape (open, still being clicked out); closedPolygon is
  // the finished one that counts are computed from. Only one is ever
  // non-empty/non-null at a time.
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<LatLngTuple[]>([]);
  const [closedPolygon, setClosedPolygon] = useState<LatLngTuple[] | null>(
    null
  );

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function handleMapClick(lat: number, lng: number) {
    if (drawMode) {
      setDrawPoints((points) => [...points, [lat, lng]]);
      return;
    }

    setAddingAt({ lat, lng });
    setNotesInput("");
  }

  function handleStartDrawing() {
    // Drawing and drop-a-pin are mutually exclusive click behaviors on
    // the same map — bail out of whichever pin-drop flow was mid-way
    // through so a stray click can't be misread as the wrong one.
    setAddingAt(null);
    setNotesInput("");
    setClosedPolygon(null);
    setDrawPoints([]);
    setDrawMode(true);
  }

  function handleUndoPoint() {
    setDrawPoints((points) => points.slice(0, -1));
  }

  function handleFinishDrawing() {
    if (drawPoints.length < 3) return;

    setClosedPolygon(drawPoints);
    setDrawPoints([]);
    setDrawMode(false);
  }

  function handleCancelDrawing() {
    setDrawMode(false);
    setDrawPoints([]);
  }

  function handleClearArea() {
    setClosedPolygon(null);
  }

  const areaCounts = useMemo(() => {
    if (!closedPolygon) return null;

    const insideCustomers = customers.filter((customer) =>
      isPointInPolygon([customer.latitude, customer.longitude], closedPolygon)
    );

    const insideDoorHangers = doorHangers.filter((drop) =>
      isPointInPolygon([drop.latitude, drop.longitude], closedPolygon)
    );

    return {
      current: insideCustomers.filter((c) => c.tier === "current").length,
      recent: insideCustomers.filter((c) => c.tier === "recent").length,
      past: insideCustomers.filter((c) => c.tier === "past").length,
      noService: insideCustomers.filter((c) => c.tier === "no_service")
        .length,
      totalCustomers: insideCustomers.length,
      doorHangersHung: insideDoorHangers.filter(
        (d) => d.status === "door_hanger"
      ).length,
      leads: insideDoorHangers.filter((d) => d.status === "lead").length,
    };
  }, [closedPolygon, customers, doorHangers]);

  function handleConfirmAdd() {
    if (!addingAt) return;

    const { lat, lng } = addingAt;

    startTransition(async () => {
      try {
        await addDoorHangerDrop(lat, lng, notesInput.trim() || null);
        setAddingAt(null);
        setNotesInput("");
        setActionError(null);
      } catch (error) {
        setActionError(
          errorMessage(error, "Couldn't save that pin. Try again.")
        );
      }
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
      try {
        await updateDoorHangerStatus(id, nextStatus);
        setActionError(null);
      } catch (error) {
        setActionError(
          errorMessage(error, "Couldn't update that pin. Try again.")
        );
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteDoorHangerDrop(id);
        setActionError(null);
      } catch (error) {
        setActionError(
          errorMessage(error, "Couldn't remove that pin. Try again.")
        );
      }
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
                    fontSize: "0.8rem",
                    fontWeight: "bold",
                    color: "#2563eb",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "6px 0",
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
                    fontSize: "0.8rem",
                    fontWeight: "bold",
                    color: "#dc2626",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "6px 0",
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

        {drawPoints.map((point, index) => (
          <CircleMarker
            key={`draw-point-${index}`}
            center={point}
            radius={5}
            pathOptions={{
              color: "white",
              weight: 1.5,
              fillColor: "#174734",
              fillOpacity: 1,
            }}
          />
        ))}

        {drawPoints.length >= 2 && (
          <Polyline
            positions={drawPoints}
            pathOptions={{ color: "#174734", weight: 3, dashArray: "6 6" }}
          />
        )}

        {closedPolygon && (
          <Polygon
            positions={closedPolygon}
            pathOptions={{
              color: "#174734",
              weight: 3,
              fillColor: "#174734",
              fillOpacity: 0.12,
            }}
          />
        )}
      </MapContainer>

      {!drawMode && !closedPolygon && (
        <div className="absolute top-4 right-4 z-[1000]">
          <button
            onClick={handleStartDrawing}
            className="rounded-full bg-[#174734] px-4 py-2 text-xs font-bold text-white shadow-lg"
          >
            Draw Area
          </button>
        </div>
      )}

      {drawMode && (
        <div className="absolute top-4 right-4 z-[1000] w-[calc(100vw-2rem)] max-w-64 rounded-2xl bg-white p-4 shadow-lg">
          <p className="text-sm font-bold text-[#174734]">
            Tap the map to trace a border
          </p>
          <p className="mt-1 text-xs text-[#6b705c]">
            {drawPoints.length < 3
              ? `${drawPoints.length} point${drawPoints.length === 1 ? "" : "s"} placed — add at least 3.`
              : `${drawPoints.length} points placed.`}
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              onClick={handleCancelDrawing}
              className="rounded-lg border border-[#d9d4c6] px-3 py-1.5 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleUndoPoint}
              disabled={drawPoints.length === 0}
              className="rounded-lg border border-[#d9d4c6] px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Undo Point
            </button>
            <button
              onClick={handleFinishDrawing}
              disabled={drawPoints.length < 3}
              className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              Finish Area
            </button>
          </div>
        </div>
      )}

      {closedPolygon && areaCounts && (
        <div className="absolute top-4 right-4 z-[1000] w-[calc(100vw-2rem)] max-w-64 rounded-2xl bg-white p-4 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-[#174734]">
              Inside this area
            </p>
            <button
              onClick={handleClearArea}
              className="text-xs font-bold text-[#6b705c]"
              aria-label="Clear drawn area"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 space-y-1.5 text-xs text-[#174734]">
            <p className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
              Current: {areaCounts.current}
            </p>
            <p className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              Recent: {areaCounts.recent}
            </p>
            <p className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#6b7280]" />
              Past: {areaCounts.past}
            </p>
            <p className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#c9c3b3]" />
              No Service: {areaCounts.noService}
            </p>
            <p className="mt-2 border-t border-[#e7e2d5] pt-2 font-bold">
              Total Customers: {areaCounts.totalCustomers}
            </p>
            <p className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#9333ea]" />
              Door Hangers Hung: {areaCounts.doorHangersHung}
            </p>
            <p className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
              Leads: {areaCounts.leads}
            </p>
          </div>
          <button
            onClick={handleStartDrawing}
            className="mt-3 w-full rounded-lg border border-[#d9d4c6] px-3 py-1.5 text-xs font-bold text-[#174734]"
          >
            Draw a Different Area
          </button>
        </div>
      )}

      {actionError && (
        <div className="absolute top-4 left-1/2 z-[1000] w-[calc(100vw-2rem)] max-w-80 -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50 p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-red-700">
              {actionError}
            </p>
            <button
              onClick={() => setActionError(null)}
              className="text-xs font-bold text-red-600"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {addingAt && (
        <div className="absolute bottom-4 left-1/2 z-[1000] w-[calc(100vw-2rem)] max-w-80 -translate-x-1/2 rounded-2xl bg-white p-4 shadow-lg">
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
