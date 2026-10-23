"use client";

// Client component for /settings/referral-sources -- same reasoning as
// CustomerContactsSection.tsx: add/rename/toggle each need inline error
// feedback without a full page reload, via useTransition.
import { useState, useTransition } from "react";
import {
  addReferralSource,
  renameReferralSource,
  setReferralSourceActive,
} from "./actions";

export type ReferralSourceRow = {
  value: string;
  label: string;
  active: boolean;
};

// Kept in sync with actions.ts's STRUCTURAL_VALUES -- these two values
// are special-cased by literal string in
// app/components/ReferralSourceField.tsx (Referred By / QR code
// pickers), so this UI disables the deactivate toggle for them rather
// than letting a click fail silently against the server-side guard.
const STRUCTURAL_VALUES = ["referral", "qr_code"];

function Row({ source }: { source: ReferralSourceRow }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(source.label);
  const [error, setError] = useState<string | null>(null);

  const isStructural = STRUCTURAL_VALUES.includes(source.value);

  function handleRename() {
    setError(null);

    if (!label.trim()) {
      setError("Enter a name.");
      return;
    }

    startTransition(async () => {
      const result = await renameReferralSource(source.value, label.trim());

      if (result.error) {
        setError(result.error);
        return;
      }

      setEditing(false);
    });
  }

  function handleToggleActive() {
    setError(null);
    startTransition(async () => {
      const result = await setReferralSourceActive(
        source.value,
        !source.active
      );

      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "12px 0",
        borderTop: "1px solid #f1f5f9",
      }}
    >
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                border: "1px solid #d9d4c6",
                fontSize: "14px",
              }}
            />
            <button
              type="button"
              disabled={isPending}
              onClick={handleRename}
              style={{
                borderRadius: "8px",
                border: "none",
                background: "#174734",
                color: "white",
                fontSize: "13px",
                fontWeight: 700,
                padding: "6px 12px",
                cursor: "pointer",
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setLabel(source.label);
                setEditing(false);
                setError(null);
              }}
              style={{
                borderRadius: "8px",
                border: "1px solid #d9d4c6",
                background: "white",
                fontSize: "13px",
                fontWeight: 700,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
              {source.label}
            </span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                border: "none",
                background: "none",
                color: "#9c7a20",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Rename
            </button>
          </div>
        )}

        {error && (
          <p style={{ margin: "4px 0 0", color: "#dc2626", fontSize: "12px" }}>
            {error}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            background: source.active ? "#dcfce7" : "#f3f4f6",
            color: source.active ? "#166534" : "#6b7280",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {source.active ? "Active" : "Inactive"}
        </span>

        {isStructural ? (
          <span
            title="Has special behavior built into the form (Referred By / QR code picker) -- can't be turned off."
            style={{ fontSize: "12px", color: "#94a3b8" }}
          >
            Required
          </span>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={handleToggleActive}
            style={{
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              background: "white",
              fontSize: "12px",
              fontWeight: 700,
              padding: "6px 10px",
              cursor: "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {source.active ? "Deactivate" : "Activate"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReferralSourcesManager({
  sources,
}: {
  sources: ReferralSourceRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function handleAdd() {
    setAddError(null);

    if (!newLabel.trim()) {
      setAddError("Enter a name for the source.");
      return;
    }

    startTransition(async () => {
      const result = await addReferralSource(newLabel.trim());

      if (result.error) {
        setAddError(result.error);
        return;
      }

      setNewLabel("");
      setAdding(false);
    });
  }

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "4px",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
          Sources
        </h2>

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              borderRadius: "8px",
              border: "1px solid #174734",
              background: "white",
              color: "#174734",
              fontSize: "13px",
              fontWeight: 700,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            + Add Source
          </button>
        )}
      </div>

      <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "13px" }}>
        Shown on the New Customer form and each customer&apos;s Property
        Profile, under &quot;How did you hear about us?&quot; Deactivating a
        source hides it from those forms going forward without touching
        any customer already saved under it.
      </p>

      {adding && (
        <div
          style={{
            marginTop: "12px",
            marginBottom: "12px",
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid #e7e2d5",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            alignItems: "flex-start",
          }}
        >
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Sky Crossing"
            style={{
              flex: "1 1 200px",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              fontSize: "14px",
            }}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={handleAdd}
            style={{
              borderRadius: "8px",
              border: "none",
              background: "#174734",
              color: "white",
              fontSize: "13px",
              fontWeight: 700,
              padding: "8px 14px",
              cursor: "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewLabel("");
              setAddError(null);
            }}
            style={{
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              background: "white",
              fontSize: "13px",
              fontWeight: 700,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          {addError && (
            <p
              style={{
                margin: 0,
                width: "100%",
                color: "#dc2626",
                fontSize: "12px",
              }}
            >
              {addError}
            </p>
          )}
        </div>
      )}

      {sources.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
          No referral sources on file.
        </p>
      ) : (
        sources.map((source) => <Row key={source.value} source={source} />)
      )}
    </div>
  );
}
