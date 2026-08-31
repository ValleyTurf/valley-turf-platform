"use client";

// One toggle per customer row. Client island for inline feedback
// without a full page reload, same pattern as InvoiceCard.tsx.
import { useState, useTransition } from "react";
import { setManualInvoicingMode } from "./actions";

export default function ModeToggle({
  jobberClientId,
  customerName,
  nativeEnabled,
}: {
  jobberClientId: string;
  customerName: string | null;
  nativeEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useState(nativeEnabled);

  function handleSet(nextEnabled: boolean) {
    if (nextEnabled === optimisticEnabled) return;

    setError(null);
    startTransition(async () => {
      const result = await setManualInvoicingMode(jobberClientId, nextEnabled, customerName);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOptimisticEnabled(nextEnabled);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid #d6ddd8" }}>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSet(true)}
          style={{
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            border: "none",
            cursor: isPending ? "default" : "pointer",
            background: optimisticEnabled ? "#174734" : "#fff",
            color: optimisticEnabled ? "#fff" : "#56655c",
          }}
        >
          Native
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSet(false)}
          style={{
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            border: "none",
            cursor: isPending ? "default" : "pointer",
            background: !optimisticEnabled ? "#174734" : "#fff",
            color: !optimisticEnabled ? "#fff" : "#56655c",
          }}
        >
          Jobber
        </button>
      </div>
      {error && <span style={{ fontSize: 11.5, color: "#a13a2a" }}>{error}</span>}
    </div>
  );
}
