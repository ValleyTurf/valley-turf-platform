// This is the actual guard for the class of outage described in
// Sidebar.tsx's and lib/permissionRules.ts's comments: a "use client"
// component transitively importing a module that reads a server-only
// secret (SUPABASE_SERVICE_ROLE_KEY, at the time) crashes hydration on
// EVERY page, because that env var is undefined in the browser bundle
// and the module throws the moment it's evaluated.
//
// It statically scans every real file under app/ and lib/, finds every
// "use client" entry point, finds every file that reads a server-only
// env var (anything that isn't NEXT_PUBLIC_-prefixed or NODE_ENV — see
// SERVER_ONLY_ENV_RE below), and fails with the exact import chain if
// any "use client" file can reach one. This runs as part of the
// existing `npm test` / CI job, so it catches this class of bug on
// every push and PR — before a deploy, not after.
//
// Deliberately a repo-scanning smoke test rather than a hand-maintained
// list of "known bad" files: the point is to catch the *next*
// server-only module someone adds without realizing a client component
// reaches it, not just re-guard the one that already broke once.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isUseClientFile,
  isUseServerFile,
  reachableFrom,
  buildChain,
  type FileMap,
} from "./importGraph";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];

// Matches process.env.SOMETHING for any SOMETHING that isn't a
// NEXT_PUBLIC_-prefixed var (those are statically inlined into the
// client bundle by Next.js, so they're genuinely safe) or NODE_ENV
// (which Next.js also inlines everywhere, client included).
const SERVER_ONLY_ENV_RE =
  /process\.env\.(?!NEXT_PUBLIC_)(?!NODE_ENV\b)[A-Z][A-Z0-9_]*/;

function collectSourceFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, out);
      continue;
    }

    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    // Test files are never part of the app's real import graph — nothing
    // in production code imports a *.test.ts — and excluding them avoids
    // false "server-only" hits from tests that set process.env directly
    // (e.g. auth.test.ts stubbing AUTH_SESSION_SECRET).
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      continue;
    }

    out.push(fullPath);
  }
}

function toRepoRelativePosixPath(absolutePath: string): string {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function loadFileMap(): FileMap {
  const absolutePaths: string[] = [];

  for (const dir of SCAN_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (fs.existsSync(fullDir)) collectSourceFiles(fullDir, absolutePaths);
  }

  const files: FileMap = new Map();

  for (const absolutePath of absolutePaths) {
    const relativePath = toRepoRelativePosixPath(absolutePath);
    files.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
  }

  return files;
}

describe("client/server boundary", () => {
  const files = loadFileMap();
  const entryPoints = Array.from(files.entries())
    .filter(([, source]) => isUseClientFile(source))
    .map(([filePath]) => filePath);
  const serverOnlyFiles = Array.from(files.entries())
    // A Server Action file that happens to also read a secret directly
    // is still safe to import from a client component — Next.js never
    // bundles its body to the client either way (see isUseServerFile).
    .filter(
      ([, source]) => SERVER_ONLY_ENV_RE.test(source) && !isUseServerFile(source)
    )
    .map(([filePath]) => filePath);

  // Sanity checks on the scanner itself — if these ever fail, the real
  // check below is passing for the wrong reason (it found nothing to
  // check), not because the app is actually safe.
  it("found source files to scan under app/ and lib/", () => {
    expect(files.size).toBeGreaterThan(50);
  });

  it("found at least one \"use client\" entry point", () => {
    expect(entryPoints.length).toBeGreaterThan(0);
  });

  it("found at least one server-only (secret env var) file", () => {
    expect(serverOnlyFiles).toContain("lib/supabase-server.ts");
  });

  it("no \"use client\" component transitively imports a server-only module", () => {
    const violations: string[] = [];

    for (const entryPoint of entryPoints) {
      const { reached, parent } = reachableFrom(files, entryPoint);

      for (const serverOnlyFile of serverOnlyFiles) {
        if (!reached.has(serverOnlyFile)) continue;

        violations.push(
          buildChain(parent, entryPoint, serverOnlyFile).join(" -> ")
        );
      }
    }

    // If this fails, the printed chain(s) above are the fix: either
    // stop the client component from importing that path (see how
    // Sidebar.tsx was moved from lib/permissions to
    // lib/permissionRules), or split the server-only piece out of the
    // shared module the way lib/permissionRules.ts was split from
    // lib/permissions.ts.
    expect(violations).toEqual([]);
  });
});
