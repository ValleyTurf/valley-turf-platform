"use client";

// Keeps the board current without a manual reload — Crew Status is meant
// to be glanced at throughout the day, and the underlying data (who's
// clocked in, who just finished a stop) is server-fetched, so the only
// way to pick up changes is to periodically re-run the server component.
// router.refresh() re-fetches the current route's server data in place
// without a full page reload or losing scroll position.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 45_000;

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  return null;
}
