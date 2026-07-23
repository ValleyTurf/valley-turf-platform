"use client";

import { useState } from "react";

type ScanCaptureProps = {
  scanId: string;
  campaignId: string;
  destination: string;
  campaignName: string;
};

export default function ScanCapture({
  scanId,
  campaignId,
  destination,
  campaignName,
}: ScanCaptureProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  function goToDestination() {
    window.location.href = destination;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!phone.trim() && !email.trim()) {
      setError("Add a phone number or email so we can reach you.");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      await fetch("/api/scan-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan_id: scanId,
          campaign_id: campaignId,
          name,
          phone,
          email,
        }),
      });
    } catch {
      // Non-blocking — still send them on to the destination.
    }

    goToDestination();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f4ef] p-6 text-[#174734]">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#9c7a20]">
          Valley Turf Revival
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          Thanks for scanning{campaignName ? ` — ${campaignName}` : ""}!
        </h1>
        <p className="mt-2 text-sm text-[#6b705c]">
          Leave your info and we&apos;ll follow up about a free quote. Or skip
          ahead — either way you&apos;re headed to our site.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-[#9c7a20]">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#9c7a20]">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#9c7a20]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-[#e7e2d5] p-3 outline-none focus:border-[#d4af37]"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-xl bg-[#174734] px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-[#226246] disabled:opacity-60"
          >
            {status === "submitting" ? "Sending..." : "Get My Free Quote"}
          </button>

          <button
            type="button"
            onClick={goToDestination}
            className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-[#6b705c] underline-offset-2 hover:underline"
          >
            Skip, just take me to the site
          </button>
        </form>
      </div>
    </main>
  );
}
