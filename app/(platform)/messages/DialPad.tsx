"use client";

// Dial pad for calling any number, including people who are not saved
// customers yet. The call goes through the business number: it rings your
// cell first, then connects to the number you dialed.
import { useState } from "react";
import BusinessCallButton from "@/app/components/BusinessCallButton";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function formatForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return raw;
}

export default function DialPad() {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-[#174734] px-5 py-3 text-sm font-bold text-[#174734] transition hover:bg-[#f7f6f1]"
      >
        Dial
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-[#e7e2d5] bg-white p-4 shadow sm:w-72">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">Dial a number</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close dial pad"
          className="rounded-lg px-2 text-lg font-bold text-[#9c7a20] hover:bg-[#f7f6f1]"
        >
          ×
        </button>
      </div>

      <input
        type="tel"
        inputMode="tel"
        value={number}
        onChange={(event) => setNumber(event.target.value.replace(/[^\d+*#()\-\s.]/g, ""))}
        placeholder="(480) 555-0123"
        className="mt-2 w-full rounded-xl border border-[#d9dad2] px-3 py-2 text-center text-lg font-bold"
      />

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setNumber((prev) => prev + key)}
            className="rounded-xl bg-[#f7f6f1] py-2.5 text-lg font-bold transition hover:bg-[#efebdf]"
          >
            {key}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setNumber((prev) => prev.slice(0, -1))}
          className="rounded-xl border border-[#d9dad2] px-3 py-2 text-sm font-bold"
          aria-label="Delete last digit"
        >
          Delete
        </button>

        <div className="flex-1 text-center [&>span]:block">
          <BusinessCallButton
            phone={number}
            className="w-full rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
          >
            Call {number.replace(/\D/g, "").length === 10 ? formatForDisplay(number) : ""}
          </BusinessCallButton>
        </div>
      </div>
    </div>
  );
}
