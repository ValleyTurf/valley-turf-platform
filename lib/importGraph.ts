// Pure, filesystem-free helpers for statically walking this repo's own
// import graph. Built for lib/clientServerBoundary.test.ts, which is the
// actual guard — see that file for what it checks and why. Kept
// dependency-free (no fs/path/TS-compiler, just strings and Maps) so the
// graph logic itself is trivially unit-testable with small in-memory
// fixtures instead of needing real files on disk.
//
// This is intentionally a lightweight regex-based scanner, not a real
// parser — it only needs to be accurate for this repo's own import
// style (plain ESM import/export, "@/" alias, relative paths), not
// arbitrary JavaScript.

export type FileMap = Map<string, string>; // repo-relative path -> source

// Strips // line comments and /* */ block comments from source, while
// copying string/template literal contents through byte-for-byte
// (respecting \-escapes) so quoted text is never mistaken for a
// comment and comments inside a string are never stripped.
//
// This exists because this repo's comments are prose-heavy and
// routinely contain the literal words "import"/"export"/"from" (e.g.
// "nothing in this file may import lib/supabase-server.ts..." in this
// very file). Without stripping comments first, extractImportSpecifiers'
// lazy `[^'"]*?from\s+` can skate right through a comment like that,
// across newlines, and latch onto the next real import/quote pair it
// finds — silently attributing an unrelated import to the wrong
// statement. That's not hypothetical: it's exactly what happened when
// this scanner was first pointed at the real repo, on this exact file.
function stripComments(source: string): string {
  let result = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      result += " ";
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result += ch;
      i++;

      while (i < n) {
        const c = source[i];
        result += c;

        if (c === "\\") {
          i++;
          if (i < n) {
            result += source[i];
            i++;
          }
          continue;
        }

        i++;
        if (c === quote) break;
      }

      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

// Directive-prologue check, matching how the JS spec (and Next.js's own
// compiler) recognize a directive like "use client"/"use server": it
// only counts as the FIRST non-blank, non-comment statement in the
// file. The same string appearing later — in a comment, or as an
// incidental string expression mid-file — does not count.
function hasDirective(source: string, directive: string): boolean {
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;

    return (
      line === `"${directive}";` ||
      line === `'${directive}';` ||
      line === `"${directive}"` ||
      line === `'${directive}'`
    );
  }

  return false;
}

export function isUseClientFile(source: string): boolean {
  return hasDirective(source, "use client");
}

// Next.js compiles a "use server" module (a Server Action file) into a
// server-only RPC reference wherever client code imports it — the real
// function bodies and their own imports never reach the client bundle.
// A client component reaching a Server Action file is the *intended*
// pattern, not a bug, so reachableFrom below stops walking there
// instead of treating the action's own dependencies as reachable.
export function isUseServerFile(source: string): boolean {
  return hasDirective(source, "use server");
}

// Deliberately excludes whole-statement `import type ... from "x"` /
// `export type ... from "x"` — those are erased entirely at compile
// time (TypeScript strips them, they produce zero runtime JS), so they
// have no bundle impact and following them produces false positives.
// e.g. Sidebar.tsx's `import type { SessionUser } from "@/lib/auth"`
// never actually pulls lib/auth.ts's code into the client bundle.
const IMPORT_FROM_RE =
  /import\s+(?!type\s)(?:[^'"]*?from\s+)?["']([^"']+)["']/g;
const EXPORT_FROM_RE =
  /export\s+(?!type\s)(?:\*\s+as\s+\w+|\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
const REQUIRE_RE = /require\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

// Every module specifier a file statically or dynamically references —
// `import`, side-effect `import "x"`, `export ... from`, `require()`,
// and `import()`. Order/dedup doesn't matter to callers.
export function extractImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const code = stripComments(source);

  for (const re of [
    IMPORT_FROM_RE,
    EXPORT_FROM_RE,
    REQUIRE_RE,
    DYNAMIC_IMPORT_RE,
  ]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(code))) {
      specifiers.add(match[1]);
    }
  }

  return Array.from(specifiers);
}

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const INDEX_SUFFIXES = RESOLVE_EXTENSIONS.map((ext) => `/index${ext}`);

function normalizePath(path: string): string {
  const stack: string[] = [];

  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }

  return stack.join("/");
}

// Resolves an import specifier (as written in `fromPath`) to a
// repo-relative path matching the keys used in a FileMap, or null if it
// doesn't resolve to a known file in this repo — a bare package import
// like "react" or "next/link", or an "@/..."/relative import that
// points somewhere outside the scanned file set.
export function resolveImport(
  fromPath: string,
  specifier: string,
  knownPaths: Set<string>
): string | null {
  let target: string;

  if (specifier.startsWith("@/")) {
    target = specifier.slice(2);
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const fromDir = fromPath.split("/").slice(0, -1).join("/");
    target = normalizePath(`${fromDir}/${specifier}`);
  } else {
    return null;
  }

  if (knownPaths.has(target)) return target;

  for (const ext of RESOLVE_EXTENSIONS) {
    if (knownPaths.has(`${target}${ext}`)) return `${target}${ext}`;
  }

  for (const suffix of INDEX_SUFFIXES) {
    if (knownPaths.has(`${target}${suffix}`)) return `${target}${suffix}`;
  }

  return null;
}

export type ReachabilityResult = {
  reached: Set<string>;
  // For every reached file other than the entry point itself, the file
  // that imported it — lets callers reconstruct an "A imports B imports
  // C" chain for a clear failure message.
  parent: Map<string, string>;
};

// BFS over the repo-local import graph starting at entryPoint. Only
// follows imports that resolve to another file in `files` — external
// packages are dead ends, and already-visited files are never
// re-queued, so import cycles terminate safely.
export function reachableFrom(
  files: FileMap,
  entryPoint: string
): ReachabilityResult {
  const reached = new Set<string>([entryPoint]);
  const parent = new Map<string, string>();
  const knownPaths = new Set(files.keys());
  const queue: string[] = [entryPoint];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const source = files.get(current);
    if (source === undefined) continue;

    // Stop at a Server Action boundary — see isUseServerFile's comment.
    // The file itself stays in `reached` (harmless), but its own
    // imports are never treated as reachable from the client.
    if (current !== entryPoint && isUseServerFile(source)) continue;

    for (const specifier of extractImportSpecifiers(source)) {
      const resolved = resolveImport(current, specifier, knownPaths);
      if (!resolved || reached.has(resolved)) continue;

      reached.add(resolved);
      parent.set(resolved, current);
      queue.push(resolved);
    }
  }

  return { reached, parent };
}

// Reconstructs the import chain from entryPoint down to target using the
// parent pointers reachableFrom produced, e.g. ["Sidebar.tsx",
// "permissions.ts", "supabase-server.ts"].
export function buildChain(
  parent: Map<string, string>,
  entryPoint: string,
  target: string
): string[] {
  const chain = [target];
  let current = target;

  while (current !== entryPoint) {
    const prev = parent.get(current);
    if (!prev) break;

    chain.unshift(prev);
    current = prev;
  }

  return chain;
}
