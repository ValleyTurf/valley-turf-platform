"use client";

// Step 1 + the client half of step 2 of Plaid Link: fetch a link_token,
// open Plaid's hosted Link UI with it, and on success hand the
// public_token off to the server to exchange for a permanent connection.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";

export default function ConnectBankButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLinkToken() {
      setIsBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          cache: "no-store",
        });
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || data.error) {
          setError(data.error ?? "Failed to start Plaid Link.");
        } else {
          setLinkToken(data.linkToken);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start Plaid Link.");
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    }

    fetchLinkToken();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
      if (!publicToken) {
        setError("Plaid Link did not return a token. Try connecting again.");
        return;
      }

      setIsBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institutionName: metadata.institution?.name ?? null,
            institutionId: metadata.institution?.institution_id ?? null,
          }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
          setError(data.error ?? "Failed to connect the bank account.");
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect the bank account.");
      } finally {
        setIsBusy(false);
      }
    },
    [router]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  const disabled = !ready || !linkToken || isBusy;

  return (
    <div>
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        style={{
          border: "1px solid #0f172a",
          background: disabled ? "#f8fafc" : "#0f172a",
          color: disabled ? "#64748b" : "#ffffff",
          padding: "10px 18px",
          borderRadius: "10px",
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {isBusy ? "Connecting..." : "Connect Bank Account"}
      </button>

      {error ? (
        <div
          style={{
            marginTop: "10px",
            padding: "10px 12px",
            borderRadius: "10px",
            fontSize: "13px",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
