// Pure helpers for the native Knowledge Base (036_add_knowledge_base.sql)
// — kept free of lib/supabase-server.ts for the same reason as
// lib/quotes.ts/lib/permissionRules.ts: usable from client or server
// without dragging in a DB client, and trivially unit-testable.

export type KnowledgeBaseArticle = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// Turns the freeform "tags" input field (comma-separated, arbitrary
// whitespace/casing) into a clean, deduplicated, lowercased array —
// the same normalized form gets stored and matched against, so
// "Mowing" and "mowing" typed on two different articles land as one
// filterable tag instead of two.
export function parseTagsInput(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

// Sorted, deduplicated list of every tag in use across a set of
// articles — feeds the filter-chip row on the list page.
export function distinctTags(articles: { tags: string[] }[]): string[] {
  const set = new Set<string>();
  for (const article of articles) {
    for (const tag of article.tags) {
      set.add(tag);
    }
  }
  return [...set].sort();
}

// Plain-text search across title/content/tags, case-insensitive — the
// list page's search box filters client-visible results through this
// rather than a DB-level ilike, since the whole library is small enough
// to fetch in one query and this keeps tag-filter + text-search
// composable without juggling multiple Supabase query builders.
export function matchesSearch(
  article: { title: string; content: string; tags: string[] },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return (
    article.title.toLowerCase().includes(q) ||
    article.content.toLowerCase().includes(q) ||
    article.tags.some((tag) => tag.includes(q))
  );
}

export type MarkdownLiteBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "p"; text: string };

// Deliberately not a real markdown parser/dependency — this app has no
// markdown library installed anywhere else (descriptions/notes elsewhere
// just use whitespace-pre-wrap), and pulling one in for a single feature
// isn't worth the dependency. Supports just enough for a readable SOP:
// blank-line-separated paragraphs, "# "/"## " headers, "- "/"* " bullet
// lists, and (handled separately, at render time, by
// renderInlineBold in the page component) **bold** within any line.
export function parseMarkdownLite(content: string): MarkdownLiteBlock[] {
  const blocks: MarkdownLiteBlock[] = [];
  const rawBlocks = content.split(/\n\s*\n/);

  for (const rawBlock of rawBlocks) {
    const lines = rawBlock
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;

    if (lines.length === 1 && lines[0].startsWith("## ")) {
      blocks.push({ type: "h3", text: lines[0].slice(3).trim() });
      continue;
    }

    if (lines.length === 1 && lines[0].startsWith("# ")) {
      blocks.push({ type: "h2", text: lines[0].slice(2).trim() });
      continue;
    }

    const isList = lines.every(
      (line) => line.startsWith("- ") || line.startsWith("* ")
    );

    if (isList) {
      blocks.push({
        type: "ul",
        items: lines.map((line) => line.slice(2).trim()),
      });
      continue;
    }

    blocks.push({ type: "p", text: lines.join("\n") });
  }

  return blocks;
}
