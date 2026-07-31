"use client";

// Owns all the interactive bits of /timecards: the "Add Manual Entry"
// form and each punch row's edit/delete controls. Kept as a single
// client component (rather than the page itself) so the page stays a
// server component that just fetches and hands over plain data — same
// split as job-costs page.tsx + its saveVisitCosts action, just with
// per-row edit state added since payroll corrections need that and job
// costs logging doesn't.
import { useState, useTransition } from "react";
import { addManualShift, updateShift, deleteShift } from "./actions";

export type Employee = { id: string; name: string; role: string };

export type Punch = {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD, Phoenix-local
  clockInTime: string; // HH:MM, Phoenix-local
  clockOutTime: string | null; // HH:MM, Phoenix-local, null if still open
  hoursLabel: string;
  notes: string | null;
  wasEdited: boolean;
  isOpen: boolean;
};

function ShiftFields({
  date,
  setDate,
  clockInTime,
  setClockInTime,
  clockOutTime,
  setClockOutTime,
  notes,
  setNotes,
}: {
  date: string;
  setDate: (v: string) => void;
  clockInTime: string;
  setClockInTime: (v: string) => void;
  clockOutTime: string;
  setClockOutTime: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="block">
        <span className="text-[10px] font-bold text-[#9c7a20]">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold text-[#9c7a20]">Clock In</span>
        <input
          type="time"
          value={clockInTime}
          onChange={(e) => setClockInTime(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold text-[#9c7a20]">
          Clock Out
        </span>
        <input
          type="time"
          value={clockOutTime}
          onChange={(e) => setClockOutTime(e.target.value)}
          placeholder="Still on"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-bold text-[#9c7a20]">Notes</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </label>
    </div>
  );
}

function AddManualEntry({ employees }: { employees: Employee[] }) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [clockInTime, setClockInTime] = useState("");
  const [clockOutTime, setClockOutTime] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    setError(null);

    if (!userId || !date || !clockInTime) {
      setError("Pick an employee, date, and clock-in time.");
      return;
    }

    startTransition(async () => {
      const result = await addManualShift({
        userId,
        date,
        clockInTime,
        clockOutTime: clockOutTime || null,
        notes: notes || null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setDate("");
      setClockInTime("");
      setClockOutTime("");
      setNotes("");
      setExpanded(false);
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-[#174734] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
      >
        + Add Manual Entry
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
        Add Manual Entry
      </p>

      <label className="mt-2 block">
        <span className="text-[10px] font-bold text-[#9c7a20]">Employee</span>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] bg-white px-2 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-2">
        <ShiftFields
          date={date}
          setDate={setDate}
          clockInTime={clockInTime}
          setClockInTime={setClockInTime}
          clockOutTime={clockOutTime}
          setClockOutTime={setClockOutTime}
          notes={notes}
          setNotes={setNotes}
        />
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="flex-1 rounded-xl bg-[#174734] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save Entry"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-xl border border-[#d9d4c6] px-4 py-2.5 text-sm font-bold transition hover:bg-[#f7f6f1]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function PunchRow({
  punch,
  isEditing,
  onStartEdit,
  onCancelEdit,
}: {
  punch: Punch;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(punch.date);
  const [clockInTime, setClockInTime] = useState(punch.clockInTime);
  const [clockOutTime, setClockOutTime] = useState(punch.clockOutTime ?? "");
  const [notes, setNotes] = useState(punch.notes ?? "");

  function submitEdit() {
    setError(null);

    startTransition(async () => {
      const result = await updateShift({
        shiftId: punch.id,
        date,
        clockInTime,
        clockOutTime: clockOutTime || null,
        notes: notes || null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onCancelEdit();
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete this punch for ${punch.userName}?`)) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteShift(punch.id);
      if (result.error) setError(result.error);
    });
  }

  if (isEditing) {
    return (
      <div className="rounded-xl border border-[#d4af37] bg-[#fdf8ea] p-3">
        <p className="text-xs font-bold">{punch.userName}</p>
        <div className="mt-2">
          <ShiftFields
            date={date}
            setDate={setDate}
            clockInTime={clockInTime}
            setClockInTime={setClockInTime}
            clockOutTime={clockOutTime}
            setClockOutTime={setClockOutTime}
            notes={notes}
            setNotes={setNotes}
          />
        </div>
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending}
            className="rounded-lg bg-[#174734] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-lg border border-[#d9d4c6] px-3 py-1.5 text-xs font-bold transition hover:bg-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#f0eee6] py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {punch.userName}
          <span className="ml-2 font-normal text-[#6b705c]">
            {punch.date} · {punch.clockInTime}–
            {punch.clockOutTime ?? "now"}
          </span>
        </p>
        {punch.notes && (
          <p className="text-xs text-[#6b705c]">{punch.notes}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {punch.isOpen && (
          <span className="rounded-full bg-[#eef4ee] px-2 py-1 text-[10px] font-bold text-[#174734]">
            open
          </span>
        )}
        {punch.wasEdited && (
          <span className="rounded-full bg-[#f0f0ec] px-2 py-1 text-[10px] font-bold text-[#6b705c]">
            corrected
          </span>
        )}
        <span className="text-sm font-bold tabular-nums">{punch.hoursLabel}</span>
        <button
          type="button"
          onClick={onStartEdit}
          className="text-xs font-semibold text-[#9c7a20] hover:underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
        >
          Delete
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

export default function TimecardsInteractive({
  employees,
  punches,
}: {
  employees: Employee[];
  punches: Punch[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <AddManualEntry employees={employees} />

      <section className="rounded-2xl bg-white p-4 shadow">
        <p className="text-xs font-bold uppercase tracking-wide text-[#9c7a20]">
          Punches this week
        </p>

        {punches.length === 0 ? (
          <p className="mt-2 text-sm text-[#6b705c]">
            No punches recorded this week.
          </p>
        ) : (
          <div className="mt-2">
            {punches.map((punch) => (
              <PunchRow
                key={punch.id}
                punch={punch}
                isEditing={editingId === punch.id}
                onStartEdit={() => setEditingId(punch.id)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
