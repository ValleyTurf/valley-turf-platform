"use client";

// Small client component so the select's onChange (auto-submit the form
// on change, rather than needing a separate "Save" button) can exist at
// all — page.tsx is a server component and can't attach a DOM event
// handler directly. The server action itself is passed in as a prop;
// Next.js serializes that reference across the boundary the same way it
// does for a plain <form action={...}>.
import type { updateServiceRequestStatus } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
};

export function StatusSelect({
  requestId,
  jobberClientId,
  currentStatus,
  action,
}: {
  requestId: string;
  jobberClientId: string;
  currentStatus: string;
  action: typeof updateServiceRequestStatus;
}) {
  const boundAction = action.bind(null, requestId, jobberClientId);

  return (
    <form action={boundAction}>
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-[#d8d3c6] bg-white px-3 py-2 text-xs font-bold text-[#174734]"
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
