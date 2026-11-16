// Builds the full data backup ZIP (one CSV per table plus a manifest) and,
// for the weekly job, stores it in the private "backups" bucket, keeps the
// newest few, and hands back a signed download link. Pure helpers (table
// list, retention, manifest) live in lib/backupTables.ts.
import { supabaseServer } from "@/lib/supabase-server";
import { rowsToCsv } from "@/lib/csv";
import { buildZip, type ZipEntry } from "@/lib/zip";
import {
  BACKUP_TABLES,
  backupFileName,
  backupsToDelete,
  manifestText,
  summarizeBackup,
  type BackupSummary,
  type TableResult,
} from "@/lib/backupTables";

const PAGE_SIZE = 1000;
const BUCKET = "backups";
const KEEP_BACKUPS = 8;
const LINK_SECONDS = 7 * 24 * 60 * 60;

async function fetchAllRows(
  table: string,
  columns: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  // PostgREST caps a single response, so page through with a stable order.
  while (true) {
    const { data, error } = await supabaseServer
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return rows;
}

export type BuiltBackup = {
  zip: Buffer;
  fileName: string;
  results: TableResult[];
  summary: BackupSummary;
};

// A table that fails (missing, permissions) does not sink the whole
// backup: it is recorded in the manifest and the summary so the weekly
// job can flag it.
export async function buildBackup(): Promise<BuiltBackup> {
  const now = new Date();
  const entries: ZipEntry[] = [];
  const results: TableResult[] = [];

  for (const { table, columns } of BACKUP_TABLES) {
    try {
      const rows = await fetchAllRows(table, columns ?? "*");

      entries.push({
        name: `${table}.csv`,
        data: Buffer.from(rowsToCsv(rows), "utf8"),
      });
      results.push({ table, rows: rows.length, error: null });
    } catch (error) {
      results.push({
        table,
        rows: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  entries.unshift({
    name: "MANIFEST.txt",
    data: Buffer.from(manifestText(now, results), "utf8"),
  });

  return {
    zip: buildZip(entries),
    fileName: backupFileName(now),
    results,
    summary: summarizeBackup(results),
  };
}

export type StoredBackup = {
  fileName: string;
  bytes: number;
  downloadUrl: string | null;
  deletedOld: number;
};

export async function storeBackup(built: BuiltBackup): Promise<StoredBackup> {
  const { error: uploadError } = await supabaseServer.storage
    .from(BUCKET)
    .upload(built.fileName, built.zip, {
      contentType: "application/zip",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Couldn't save the backup file: ${uploadError.message}`);
  }

  const { data: signed } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUrl(built.fileName, LINK_SECONDS);

  let deletedOld = 0;
  const { data: files } = await supabaseServer.storage
    .from(BUCKET)
    .list("", { limit: 200 });

  if (files) {
    const old = backupsToDelete(
      files.map((f) => f.name),
      KEEP_BACKUPS
    );

    if (old.length > 0) {
      const { error: removeError } = await supabaseServer.storage
        .from(BUCKET)
        .remove(old);

      if (!removeError) deletedOld = old.length;
    }
  }

  return {
    fileName: built.fileName,
    bytes: built.zip.length,
    downloadUrl: signed?.signedUrl ?? null,
    deletedOld,
  };
}

// Used by the manual admin download and the Health page.
export async function latestStoredBackup(): Promise<{
  fileName: string;
  createdAt: string | null;
} | null> {
  const { data } = await supabaseServer.storage
    .from(BUCKET)
    .list("", { limit: 200 });

  const names = (data ?? []).map((f) => f.name).sort().reverse();
  const name = names.find((n) => n.startsWith("valley-turf-backup-"));

  if (!name) return null;

  const file = (data ?? []).find((f) => f.name === name);

  return { fileName: name, createdAt: file?.created_at ?? null };
}
