"use client";

// Staff-managed "What's Included" bullet list per service — same two-
// list structure as PricingGrid.tsx and the same reasoning: initialGroups
// is the server-fetched, already-saved list (re-read after every save
// via revalidatePath, not copied into local state), newDrafts is purely
// local state for in-progress "Add Service" forms that haven't saved yet.
import { useState, useTransition } from "react";
import { saveIncludedItems, deleteIncludedItems } from "./actions";

export type IncludedItemsGroup = {
  serviceName: string;
  items: string[];
};

export default function IncludedItemsGrid({
  initialGroups,
}: {
  initialGroups: IncludedItemsGroup[];
}) {
  const [newDrafts, setNewDrafts] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      {initialGroups.map((group) => (
        <IncludedItemsSection
          key={group.serviceName}
          serviceName={group.serviceName}
          initialItems={group.items}
          isNew={false}
        />
      ))}

      {newDrafts.map((draftKey) => (
        <IncludedItemsSection
          key={draftKey}
          serviceName=""
          initialItems={[]}
          isNew
          onSaved={() =>
            setNewDrafts((prev) => prev.filter((key) => key !== draftKey))
          }
          onCancel={() =>
            setNewDrafts((prev) => prev.filter((key) => key !== draftKey))
          }
        />
      ))}

      <button
        type="button"
        onClick={() => setNewDrafts((prev) => [...prev, crypto.randomUUID()])}
        className="rounded-xl border border-dashed border-[#174734]/40 px-4 py-3 text-sm font-bold text-[#174734] transition hover:border-[#174734] hover:bg-white"
      >
        + Add Service
      </button>
    </div>
  );
}

function IncludedItemsSection({
  serviceName,
  initialItems,
  isNew,
  onSaved,
  onCancel,
}: {
  serviceName: string;
  initialItems: string[];
  isNew: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(serviceName);
  const [itemsText, setItemsText] = useState(initialItems.join("\n"));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Service name is required.");
      return;
    }

    startTransition(async () => {
      const result = await saveIncludedItems(trimmedName, itemsText);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
      onSaved?.();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete the included-items list for "${serviceName}"? This can't be undone.`)) {
      return;
    }

    startTransition(async () => {
      const result = await deleteIncludedItems(serviceName);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[#e7e2d5] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isNew ? (
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Service name, e.g. Full Cleaning"
            autoFocus
            className="w-64 rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm font-bold outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
          />
        ) : (
          <h3 className="text-lg font-bold">{serviceName}</h3>
        )}

        {!isNew && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs font-bold text-red-600 hover:underline disabled:opacity-60"
          >
            Delete list
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <label
          htmlFor={`items_${serviceName || "new"}`}
          className="text-xs font-bold text-[#9c7a20]"
        >
          What&apos;s Included
        </label>
        <textarea
          id={`items_${serviceName || "new"}`}
          value={itemsText}
          onChange={(event) => setItemsText(event.target.value)}
          rows={6}
          placeholder={"One item per line, e.g.\nTurf Fluff Up\nEdge Cleaning\nDebris Removal"}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-[#174734] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save List"}
          </button>

          {isNew && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="text-xs font-bold text-[#6b705c] hover:underline disabled:opacity-60"
            >
              Cancel
            </button>
          )}

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          {saved && !error && (
            <p className="text-xs font-semibold text-green-700">Saved.</p>
          )}
        </div>

        <p className="mt-2 text-xs text-[#6b705c]">
          Shown on flat-price quotes for this service under &quot;What&apos;s
          Included&quot;. Same for every turf size — only the price varies
          by size.
        </p>
      </form>
    </div>
  );
}
