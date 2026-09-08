"use client";

// Small client wrapper just for the Email/Text tab toggle -- the actual
// submit still goes straight to the requestPortalLogin server action
// (no client-side validation beyond `required`), same as the plain
// <form action={...}> this replaced.
import { useState } from "react";
import { requestPortalLogin } from "./actions";

export default function PortalLoginForm() {
  const [channel, setChannel] = useState<"email" | "phone">("email");

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setChannel("email")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            channel === "email"
              ? "bg-[#174734] text-white"
              : "border border-[#d8d3c6] bg-white text-[#174734] hover:border-[#d4af37]"
          }`}
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setChannel("phone")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            channel === "phone"
              ? "bg-[#174734] text-white"
              : "border border-[#d8d3c6] bg-white text-[#174734] hover:border-[#d4af37]"
          }`}
        >
          Text
        </button>
      </div>

      <form action={requestPortalLogin} className="mt-4 space-y-3">
        <input type="hidden" name="channel" value={channel} />

        {channel === "email" ? (
          <>
            <label
              htmlFor="email"
              className="text-sm font-semibold text-[#6b705c]"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </>
        ) : (
          <>
            <label
              htmlFor="phone"
              className="text-sm font-semibold text-[#6b705c]"
            >
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="(555) 555-5555"
              className="block w-full rounded-xl border border-[#d8d3c6] bg-white px-4 py-3 text-[#174734] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
            />
          </>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-[#174734] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#226246]"
        >
          {channel === "email" ? "Send sign-in link" : "Text me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
