import { describe, it, expect } from "vitest";
import {
  BACKUP_TABLES,
  NEVER_BACK_UP,
  backupFileName,
  backupsToDelete,
  manifestText,
  summarizeBackup,
} from "./backupTables";

describe("BACKUP_TABLES", () => {
  it("never includes credential tables", () => {
    const names = BACKUP_TABLES.map((t) => t.table);
    for (const secret of NEVER_BACK_UP) {
      expect(names).not.toContain(secret);
    }
  });

  it("has no duplicate tables", () => {
    const names = BACKUP_TABLES.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it("holds back the password hash on users", () => {
    const users = BACKUP_TABLES.find((t) => t.table === "users");
    expect(Boolean(users?.columns)).toBe(true);
    expect(users?.columns).not.toContain("password");
  });
});

describe("backupsToDelete", () => {
  const mk = (d: string) => `valley-turf-backup-${d}.zip`;

  it("keeps the newest N and deletes the rest", () => {
    const names = [mk("2026-01-04"), mk("2026-01-18"), mk("2026-01-11"), mk("2026-01-25")];
    expect(backupsToDelete(names, 2)).toEqual([mk("2026-01-11"), mk("2026-01-04")]);
  });

  it("never touches files that are not backups", () => {
    expect(backupsToDelete(["notes.txt", mk("2026-01-04")], 1)).toEqual([]);
  });

  it("always keeps at least one", () => {
    expect(backupsToDelete([mk("2026-01-04"), mk("2026-01-11")], 0)).toEqual([
      mk("2026-01-04"),
    ]);
  });
});

describe("summaries", () => {
  const results = [
    { table: "a", rows: 5, error: null },
    { table: "b", rows: 0, error: "relation does not exist" },
    { table: "c", rows: 7, error: null },
  ];

  it("counts saved tables and rows and lists failures", () => {
    expect(summarizeBackup(results)).toEqual({
      tables: 2,
      rows: 12,
      failedTables: ["b"],
    });
  });

  it("puts failures in the manifest", () => {
    const text = manifestText(new Date("2026-01-04T10:00:00Z"), results);
    expect(text).toContain("could NOT be saved");
    expect(text).toContain("b: relation does not exist");
    expect(text).toContain("c: 7");
  });

  it("names files by date", () => {
    expect(backupFileName(new Date("2026-03-08T10:20:00Z"))).toBe(
      "valley-turf-backup-2026-03-08.zip"
    );
  });
});
