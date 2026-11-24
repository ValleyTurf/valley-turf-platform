import { describe, it, expect } from "vitest";
import vercelConfig from "../vercel.json";
import { JOB_REGISTRY, UNTRACKED_PATHS, watchedJobs } from "./cronWatchLogic";

describe("cron registry", () => {
  const paths = Array.from(new Set((vercelConfig.crons as { path: string }[]).map((c) => c.path)));

  it("every cron in vercel.json is either watched or explicitly untracked", () => {
    for (const path of paths) {
      const known = path in JOB_REGISTRY || UNTRACKED_PATHS.includes(path);
      expect(known).toBe(true);
    }
  });
  it("every registered job has a usable schedule", () => {
    const jobs = watchedJobs(vercelConfig.crons as { path: string; schedule: string }[]);
    const registered = paths.filter((p) => p in JOB_REGISTRY);
    expect(jobs.length).toBe(registered.length);
  });
});
