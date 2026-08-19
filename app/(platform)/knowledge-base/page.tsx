export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { formatDateOnly } from "@/lib/format";
import {
  distinctTags,
  matchesSearch,
  type KnowledgeBaseArticle,
} from "@/lib/knowledgeBase";

type KnowledgeBasePageProps = {
  searchParams: Promise<{ q?: string; tag?: string }>;
};

// Short plain-text preview for the list cards — strips the markdown-lite
// markers (heading "#"/"##", bullet "-"/"*", bold "**") rather than
// reusing parseMarkdownLite's block structure, since all this needs is
// a single flattened line, not the full block breakdown the detail page
// renders.
function excerpt(content: string): string {
  const plain = content
    .split("\n")
    .map((line) => line.replace(/^#{1,2}\s+/, "").replace(/^[-*]\s+/, ""))
    .join(" ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
}

export default async function KnowledgeBasePage({
  searchParams,
}: KnowledgeBasePageProps) {
  const [{ q, tag }, actor] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ]);

  const search = (q ?? "").trim();
  const activeTag = (tag ?? "").trim().toLowerCase();
  const canEdit = actor?.role === "admin" || actor?.role === "manager";

  const { data, error } = await supabaseServer
    .from("knowledge_base_articles")
    .select(
      "id, title, content, tags, created_by_name, updated_by_name, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  const allArticles = (data ?? []) as KnowledgeBaseArticle[];
  const tags = distinctTags(allArticles);

  const articles = allArticles.filter((article) => {
    if (activeTag && !article.tags.includes(activeTag)) return false;
    return matchesSearch(article, search);
  });

  function filterUrl(nextTag: string): string {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (nextTag) params.set("tag", nextTag);
    const qs = params.toString();
    return qs ? `/knowledge-base?${qs}` : "/knowledge-base";
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Knowledge Base
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              SOPs, policies, and procedures — everyone can read these,
              managers and admins can add or update them.
            </p>
          </div>

          {canEdit && (
            <Link
              href="/knowledge-base/new"
              className="rounded-xl bg-[#d4af37] px-5 py-3 text-center text-sm font-bold text-[#174734] transition hover:bg-[#e6c766]"
            >
              + New Article
            </Link>
          )}
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            {activeTag && <input type="hidden" name="tag" value={activeTag} />}
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="q" className="text-xs font-bold text-[#9c7a20]">
                Search
              </label>
              <input
                id="q"
                name="q"
                type="text"
                defaultValue={search}
                placeholder="Title, content, or tag…"
                className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246]"
            >
              Search
            </button>
          </form>

          {tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={filterUrl("")}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  !activeTag
                    ? "bg-[#174734] text-white"
                    : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                }`}
              >
                All
              </Link>
              {tags.map((t) => (
                <Link
                  key={t}
                  href={filterUrl(t)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${
                    activeTag === t
                      ? "bg-[#174734] text-white"
                      : "border border-[#d8d3c6] bg-white text-[#6b705c] hover:border-[#d4af37]"
                  }`}
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
        </section>

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">
              Knowledge Base could not be loaded
            </p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : articles.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-5 shadow">
            <p className="text-sm text-[#6b705c]">
              {allArticles.length === 0
                ? canEdit
                  ? "No articles yet — add the first SOP or policy to get started."
                  : "No articles yet."
                : "No articles match this filter."}
            </p>
          </section>
        ) : (
          <section className="mt-6 space-y-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/knowledge-base/${article.id}`}
                className="block rounded-2xl border border-[#e7e2d5] bg-white p-5 shadow-sm transition hover:border-[#d4af37]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-bold">{article.title}</p>
                  <p className="shrink-0 text-xs text-[#6b705c]">
                    Updated {formatDateOnly(article.updated_at)}
                    {article.updated_by_name
                      ? ` by ${article.updated_by_name}`
                      : ""}
                  </p>
                </div>

                {excerpt(article.content) && (
                  <p className="mt-2 text-sm text-[#6b705c]">
                    {excerpt(article.content)}
                  </p>
                )}

                {article.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {article.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[#f0eee6] px-2.5 py-1 text-xs font-semibold capitalize text-[#6b705c]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
