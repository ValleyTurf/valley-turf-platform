"use client";

// Client component (rather than the plain <form action> this used to be)
// for the same reason as VisitNoteForm/OnWayButton on this page: a crew
// member tapping "Save Job Costs" had no way to tell whether it actually
// saved — the form just sat there either way, success or failure both
// looked identical (nothing happened). This adds a "Saved" confirmation
// and surfaces an actual error message instead of a silent
// server-only console.error.
import { useState, useTransition } from "react";
import { saveVisitJobCostQuickEntry } from "./actions";

type QuickEntryMaterial = {
  id: string;
  name: string;
  unit_label: string;
};

type QuickEntryEquipment = {
  id: string;
  name: string;
};

function quickEntryFieldKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

export default function JobCostQuickEntryForm({
  visitId,
  materials,
  equipment,
  defaultQuantities,
  defaultCheckedEquipmentIds,
}: {
  visitId: string;
  materials: QuickEntryMaterial[];
  equipment: QuickEntryEquipment[];
  defaultQuantities: Record<string, number>;
  defaultCheckedEquipmentIds: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const checkedEquipmentSet = new Set(defaultCheckedEquipmentIds);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveVisitJobCostQuickEntry(visitId, formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
      // Matches CopyLinkButton's 2s flash elsewhere in the app — this
      // form gets saved multiple times over a visit as costs trickle in,
      // so a persistent "saved" state would look stale/wrong the next
      // time someone glances at it.
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-2 rounded-xl border border-[#174734]/15 bg-[#f7f6f1] p-3"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[#174734]/70">
        Job Costs
      </p>

      {materials.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {materials.map((material) => (
            <label
              key={material.id}
              className="text-xs font-semibold text-[#174734]"
            >
              {material.name}
              <input
                type="number"
                step="0.01"
                min="0"
                name={quickEntryFieldKey(material.name)}
                defaultValue={defaultQuantities[material.id] || ""}
                placeholder={material.unit_label ?? ""}
                className="mt-1 w-full rounded-lg border border-[#174734]/20 px-2 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>
      )}

      {equipment.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {equipment.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#174734]"
            >
              <input
                type="checkbox"
                name={quickEntryFieldKey(item.name)}
                value="1"
                defaultChecked={checkedEquipmentSet.has(item.id)}
                className="h-4 w-4 rounded border-[#174734]/30"
              />
              {item.name}
            </label>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg border border-[#174734] px-3 py-1.5 text-xs font-bold text-[#174734] transition hover:bg-white disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save Job Costs"}
      </button>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {saved && !error && (
        <p className="text-xs font-semibold text-green-700">
          ✓ Job Costs Saved
        </p>
      )}
    </form>
  );
}
