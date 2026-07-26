import { describe, expect, it } from "vitest";
import {
  isUseClientFile,
  isUseServerFile,
  extractImportSpecifiers,
  resolveImport,
  reachableFrom,
  buildChain,
  type FileMap,
} from "./importGraph";

describe("isUseClientFile", () => {
  it("recognizes a leading double-quoted directive", () => {
    expect(isUseClientFile('"use client";\n\nimport { useState } from "react";')).toBe(
      true
    );
  });

  it("recognizes a leading single-quoted directive with no semicolon", () => {
    expect(isUseClientFile("'use client'\n\nexport default function X() {}")).toBe(
      true
    );
  });

  it("skips leading blank lines and line comments before the directive", () => {
    const source = `
// some header comment

"use client";

import Link from "next/link";
`;
    expect(isUseClientFile(source)).toBe(true);
  });

  it("does not count a directive that appears after other statements", () => {
    const source = `import Link from "next/link";\n"use client";`;
    expect(isUseClientFile(source)).toBe(false);
  });

  it("returns false for a file with no directive at all", () => {
    expect(isUseClientFile('import Link from "next/link";')).toBe(false);
  });

  it("returns false for an empty file", () => {
    expect(isUseClientFile("")).toBe(false);
  });
});

describe("isUseServerFile", () => {
  it("recognizes a leading \"use server\" directive", () => {
    expect(isUseServerFile('"use server";\n\nexport async function foo() {}')).toBe(
      true
    );
  });

  it("returns false for a \"use client\" file", () => {
    expect(isUseServerFile('"use client";\n\nimport { useState } from "react";')).toBe(
      false
    );
  });

  it("returns false for a file with no directive", () => {
    expect(isUseServerFile("export const x = 1;")).toBe(false);
  });
});

describe("extractImportSpecifiers", () => {
  it("extracts default, named, and side-effect imports", () => {
    const source = `
import Link from "next/link";
import { useState, useEffect } from "react";
import "server-only";
`;
    const specifiers = extractImportSpecifiers(source);
    expect(specifiers).toContain("next/link");
    expect(specifiers).toContain("react");
    expect(specifiers).toContain("server-only");
  });

  it("extracts imports spanning multiple lines", () => {
    const source = `import {
  formatCurrency,
  formatPercent,
} from "@/lib/format";`;
    expect(extractImportSpecifiers(source)).toEqual(["@/lib/format"]);
  });

  it("ignores whole-statement type-only imports (erased at compile time, zero bundle impact)", () => {
    const source = `import type { SessionUser } from "@/lib/auth";\nimport type Foo from "./foo";`;
    expect(extractImportSpecifiers(source)).toEqual([]);
  });

  it("ignores whole-statement type-only re-exports", () => {
    const source = `export type { SessionUser } from "@/lib/auth";`;
    expect(extractImportSpecifiers(source)).toEqual([]);
  });

  it("still extracts a real (non-type) import from the same file as a type-only one", () => {
    const source = `import type { SessionUser } from "@/lib/auth";\nimport { useState } from "react";`;
    expect(extractImportSpecifiers(source)).toEqual(["react"]);
  });

  it("extracts export-from re-exports", () => {
    const source = `export { foo } from "./foo";\nexport * from "./bar";\nexport * as ns from "./baz";`;
    const specifiers = extractImportSpecifiers(source);
    expect(specifiers).toEqual(
      expect.arrayContaining(["./foo", "./bar", "./baz"])
    );
  });

  it("extracts dynamic import() and require()", () => {
    const source = `const mod = await import("./lazy");\nconst legacy = require("./legacy");`;
    const specifiers = extractImportSpecifiers(source);
    expect(specifiers).toEqual(
      expect.arrayContaining(["./lazy", "./legacy"])
    );
  });

  it("returns an empty array for a file with no imports", () => {
    expect(extractImportSpecifiers("export const x = 1;")).toEqual([]);
  });

  it("does not mistake the word \"import\"/\"from\" inside a comment for a real import, matching the real permissionRules.ts shape", () => {
    // This is the exact regression this scanner hit against the real
    // repo: a prose comment mentioning "import ... from" let the lazy
    // `[^'"]*?from\s+` group skate across the comment (and the newlines
    // after it) and latch onto the next real quoted import below,
    // wrongly attributing it as if the comment line itself were code.
    const source = `
// Nothing in this file may import lib/supabase-server.ts, directly or
// transitively, from anywhere.

import type { Role } from "@/lib/auth";

export const x = 1;
`;
    expect(extractImportSpecifiers(source)).toEqual([]);
  });

  it("does not let a \"//\" inside a string literal be mistaken for a comment", () => {
    const source = `import { supabaseServer } from "@/lib/supabase-server";\nconst url = "https://example.com";`;
    expect(extractImportSpecifiers(source)).toEqual(["@/lib/supabase-server"]);
  });

  it("strips a block comment without merging the tokens on either side of it", () => {
    const source = `import/* why */{ foo } from "./foo";`;
    expect(extractImportSpecifiers(source)).toEqual(["./foo"]);
  });

  it("dedupes repeated specifiers", () => {
    const source = `import { a } from "./x";\nimport { b } from "./x";`;
    expect(extractImportSpecifiers(source)).toEqual(["./x"]);
  });
});

describe("resolveImport", () => {
  const knownPaths = new Set([
    "lib/format.ts",
    "lib/supabase-server.ts",
    "app/components/Foo.tsx",
    "app/components/layout/Sidebar.tsx",
    "app/components/widgets/index.ts",
  ]);

  it("resolves an '@/' alias to a repo-relative path", () => {
    expect(resolveImport("app/components/Foo.tsx", "@/lib/format", knownPaths)).toBe(
      "lib/format.ts"
    );
  });

  it("resolves a same-directory relative import", () => {
    expect(
      resolveImport(
        "app/components/layout/Sidebar.tsx",
        "../Foo",
        knownPaths
      )
    ).toBe("app/components/Foo.tsx");
  });

  it("resolves a '../' import that walks up multiple directories", () => {
    expect(
      resolveImport("app/components/layout/Sidebar.tsx", "../../../lib/format", knownPaths)
    ).toBe("lib/format.ts");
  });

  it("resolves to an index file when the directory itself is imported", () => {
    expect(
      resolveImport("app/components/Foo.tsx", "./widgets", knownPaths)
    ).toBe("app/components/widgets/index.ts");
  });

  it("returns null for a bare package specifier", () => {
    expect(resolveImport("app/components/Foo.tsx", "react", knownPaths)).toBeNull();
    expect(
      resolveImport("app/components/Foo.tsx", "next/link", knownPaths)
    ).toBeNull();
  });

  it("returns null for an alias/relative import outside the known set", () => {
    expect(
      resolveImport("app/components/Foo.tsx", "@/lib/nonexistent", knownPaths)
    ).toBeNull();
  });
});

describe("reachableFrom / buildChain", () => {
  it("finds a direct import", () => {
    const files: FileMap = new Map([
      ["a.ts", 'import { b } from "./b";'],
      ["b.ts", "export const b = 1;"],
    ]);

    const { reached } = reachableFrom(files, "a.ts");
    expect(reached).toEqual(new Set(["a.ts", "b.ts"]));
  });

  it("finds a transitive import several hops deep, matching the real Sidebar bug shape", () => {
    const files: FileMap = new Map([
      [
        "app/components/layout/Sidebar.tsx",
        '"use client";\nimport { isPathAllowedForRole } from "@/lib/permissions";',
      ],
      [
        "lib/permissions.ts",
        'import { supabaseServer } from "@/lib/supabase-server";',
      ],
      ["lib/supabase-server.ts", "export const supabaseServer = {};"],
    ]);

    const { reached, parent } = reachableFrom(
      files,
      "app/components/layout/Sidebar.tsx"
    );

    expect(reached.has("lib/supabase-server.ts")).toBe(true);
    expect(
      buildChain(parent, "app/components/layout/Sidebar.tsx", "lib/supabase-server.ts")
    ).toEqual([
      "app/components/layout/Sidebar.tsx",
      "lib/permissions.ts",
      "lib/supabase-server.ts",
    ]);
  });

  it("does not reach a file through an import that was fixed to point elsewhere", () => {
    const files: FileMap = new Map([
      [
        "app/components/layout/Sidebar.tsx",
        '"use client";\nimport { isPathAllowedForRole } from "@/lib/permissionRules";',
      ],
      ["lib/permissionRules.ts", "export const isPathAllowedForRole = () => true;"],
      [
        "lib/permissions.ts",
        'import { supabaseServer } from "@/lib/supabase-server";',
      ],
      ["lib/supabase-server.ts", "export const supabaseServer = {};"],
    ]);

    const { reached } = reachableFrom(
      files,
      "app/components/layout/Sidebar.tsx"
    );

    expect(reached.has("lib/supabase-server.ts")).toBe(false);
    expect(reached.has("lib/permissions.ts")).toBe(false);
  });

  it("does not traverse past a \"use server\" Server Action file, matching the real ChangePasswordForm shape", () => {
    const files: FileMap = new Map([
      [
        "app/(platform)/account/ChangePasswordForm.tsx",
        '"use client";\nimport { changeOwnPassword } from "./actions";',
      ],
      [
        "app/(platform)/account/actions.ts",
        '"use server";\nimport { supabaseServer } from "@/lib/supabase-server";',
      ],
      ["lib/supabase-server.ts", "export const supabaseServer = {};"],
    ]);

    const { reached } = reachableFrom(
      files,
      "app/(platform)/account/ChangePasswordForm.tsx"
    );

    // Reaching the action file itself is fine and expected — Next.js
    // compiles it to a server-only RPC reference either way.
    expect(reached.has("app/(platform)/account/actions.ts")).toBe(true);
    // But its own imports never make it into the client bundle, so the
    // walk must not continue past it.
    expect(reached.has("lib/supabase-server.ts")).toBe(false);
  });

  it("terminates on an import cycle instead of looping forever", () => {
    const files: FileMap = new Map([
      ["a.ts", 'import "./b";'],
      ["b.ts", 'import "./a";'],
    ]);

    const { reached } = reachableFrom(files, "a.ts");
    expect(reached).toEqual(new Set(["a.ts", "b.ts"]));
  });

  it("ignores imports that don't resolve to a known file", () => {
    const files: FileMap = new Map([
      ["a.ts", 'import "react";\nimport "./missing";'],
    ]);

    const { reached } = reachableFrom(files, "a.ts");
    expect(reached).toEqual(new Set(["a.ts"]));
  });

  it("buildChain falls back to just the target if no path was recorded", () => {
    const parent = new Map<string, string>();
    expect(buildChain(parent, "a.ts", "z.ts")).toEqual(["z.ts"]);
  });
});
