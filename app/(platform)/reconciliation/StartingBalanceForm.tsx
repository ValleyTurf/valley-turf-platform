// Shared by the Reconciliation report (one per account card) and the
// per-account drill-down page -- same form, same action, so the two
// can't drift. Plain server-action form, no client JS needed.
import { toNumber } from "@/lib/format";
import { updateStartingBalance } from "./actions";

type Props = {
  accountId: string;
  startingBalance: number | null;
  startingBalanceDate: string;
};

export default function StartingBalanceForm({
  accountId,
  startingBalance,
  startingBalanceDate,
}: Props) {
  return (
    <details>
      <summary
        style={{
          cursor: "pointer",
          color: "#64748b",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {startingBalance !== null ? "Edit starting balance" : "Set starting balance"}
      </summary>

      <form
        action={updateStartingBalance.bind(null, accountId)}
        style={{ display: "grid", gap: "8px", marginTop: "10px", maxWidth: "260px" }}
      >
        <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
          Balance (from your bank statement)
          <input
            name="starting_balance"
            type="number"
            step="0.01"
            defaultValue={startingBalance !== null ? toNumber(startingBalance) : ""}
            required
            style={{
              display: "block",
              marginTop: "4px",
              width: "100%",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "6px 8px",
              fontSize: "13px",
            }}
          />
        </label>

        <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
          As of date
          <input
            name="starting_balance_date"
            type="date"
            defaultValue={startingBalanceDate}
            required
            style={{
              display: "block",
              marginTop: "4px",
              width: "100%",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              padding: "6px 8px",
              fontSize: "13px",
            }}
          />
        </label>

        <button
          type="submit"
          style={{
            marginTop: "2px",
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#ffffff",
            padding: "6px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Save
        </button>
      </form>
    </details>
  );
}
