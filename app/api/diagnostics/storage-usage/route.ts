import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// TEMPORARY diagnostic route — delete once the Supabase storage-quota
// investigation is resolved. Reports aggregate byte counts and object
// counts only, grouped by bucket and top-level path prefix — no file
// contents, no customer PII beyond a jobber id already visible elsewhere
// in the app. No auth gate since this is short-lived and read-only.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("mode") === "count-only") {
    // Minimal probe: isolate whether the storage.objects count query
    // itself is the slow/failing part, before trying full pagination.
    try {
      const { count, error } = await supabaseServer
        .schema("storage")
        .from("objects")
        .select("*", { count: "exact", head: true });

      if (error) throw error;
      return NextResponse.json({ count });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  try {
    type Row = {
      bucket_id: string | null;
      name: string;
      metadata: { size?: number } | null;
      created_at: string | null;
    };

    const pageSize = 1000;

    // Get the total count first so pages can be fetched in parallel
    // instead of one-at-a-time — a prior diagnostic route in this app
    // timed out doing sequential pagination against a large table.
    const { count, error: countError } = await supabaseServer
      .schema("storage")
      .from("objects")
      .select("*", { count: "exact", head: true });

    if (countError) throw countError;

    const totalCount = count ?? 0;
    const pageStarts: number[] = [];
    for (let from = 0; from < totalCount; from += pageSize) {
      pageStarts.push(from);
    }

    const pages = await Promise.all(
      pageStarts.map(async (from) => {
        const { data, error } = await supabaseServer
          .schema("storage")
          .from("objects")
          .select("bucket_id, name, metadata, created_at")
          .range(from, from + pageSize - 1);

        if (error) throw error;
        return (data ?? []) as Row[];
      })
    );

    const rows: Row[] = pages.flat();

    let totalBytes = 0;
    const byBucket = new Map<string, { count: number; bytes: number }>();
    const byPrefix = new Map<string, { count: number; bytes: number }>();

    for (const row of rows) {
      const size = row.metadata?.size ?? 0;
      totalBytes += size;

      const bucket = row.bucket_id ?? "(none)";
      const bucketAgg = byBucket.get(bucket) ?? { count: 0, bytes: 0 };
      bucketAgg.count += 1;
      bucketAgg.bytes += size;
      byBucket.set(bucket, bucketAgg);

      const topLevel = row.name.includes("/") ? row.name.split("/")[0] : "(root)";
      const prefixKey = `${bucket}/${topLevel}`;
      const prefixAgg = byPrefix.get(prefixKey) ?? { count: 0, bytes: 0 };
      prefixAgg.count += 1;
      prefixAgg.bytes += size;
      byPrefix.set(prefixKey, prefixAgg);
    }

    const largest = [...rows]
      .sort((a, b) => (b.metadata?.size ?? 0) - (a.metadata?.size ?? 0))
      .slice(0, 15)
      .map((r) => ({
        bucket: r.bucket_id,
        name: r.name,
        bytes: r.metadata?.size ?? 0,
        created_at: r.created_at,
      }));

    const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

    return NextResponse.json({
      totalObjects: rows.length,
      totalMB: mb(totalBytes),
      totalGB: Math.round((totalBytes / 1024 / 1024 / 1024) * 100) / 100,
      byBucket: Object.fromEntries(
        [...byBucket.entries()].map(([k, v]) => [k, { count: v.count, MB: mb(v.bytes) }])
      ),
      // The two prefixes we actually expect inside visit-photos:
      // "{jobber_visit_id}/..." for app-captured (already compressed)
      // photos, and "jobber-import/..." for the bulk backfill of
      // historical Jobber job-note attachments (uploaded uncompressed).
      topLevelPrefixesByBucketAndFolder: Object.fromEntries(
        [...byPrefix.entries()]
          .sort((a, b) => b[1].bytes - a[1].bytes)
          .slice(0, 20)
          .map(([k, v]) => [k, { count: v.count, MB: mb(v.bytes) }])
      ),
      largestObjects: largest.map((o) => ({ ...o, MB: mb(o.bytes) })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
