"use client";

// Manager escape hatch for a stuck timer -- see actions.ts's
// forceStopTimer for the scenario this fixes. useTransition + inline
// error (rather than a plain <form action>) so a manager knows
// immediately whether it actually worked, same reasoning as
// my-day/VisitTimer.tsx and OnWayButton.tsx.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forceStopTimer } from "./actions";

export default function ForceStopTimerButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);

  function handleClick() {
    if (
      !window.confirm(
        `Force-stop ${userName}'s timer? Use this only if they're stuck and can't stop it themselves from My Day.`
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await forceStopTimer(userId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setStopped(true);
      router.refresh();
    });
  }

  if (stopped) {
    return <p className="mt-2 text-xs font-semibold text-[#6b705c]">✓ Timer stopped.</p>;
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
      >
        {isPending ? "Stopping…" : "Force Stop Timer"}
      </button>

      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
