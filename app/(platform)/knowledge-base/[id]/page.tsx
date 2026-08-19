export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/currentUser";
import { formatDateOnly } from "@/lib/format";
import { parseMarkdownLite, type MarkdownLiteBlock } from "@/lib/knowledgeBase";
import ArticleViewOrEdit from "../ArticleViewOrEdit";

type ArticleDetail = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// Turns "some **bold** text" into alternating plain-string/<strong>
// chunks — kept separate from lib/knowledgeBase.ts's parseMarkdownLite
// since this part inherently produces JSX and that file stays
// React-free/pure/testable.
function renderInlineBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderBlock(block: MarkdownLiteBlock, index: number): ReactNode {
  switch (block.type) {
    case "h2":
      return (
        <h2 key={index} className="mt-6 text-xl font-bold first:mt-0">
          {renderInlineBold(block.text)}
        </h2>
      );
    case "h3":
      return (
        <h3 key={index} className="mt-5 text-lg font-bold first:mt-0">
          {renderInlineBold(block.text)}
        </h3>
      );
    case "ul":
      return (
        <ul key={index} className="mt-3 list-disc space-y-1 pl-5">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInlineBold(item)}</li>
          ))}
        </ul>
      );
    case "p":
      return (
        <p key={index} className="mt-3 whitespace-pre-wrap first:mt-0">
          {renderInlineBold(block.text)}
        </p>
      );
    default:
      return null;
  }
}

export default async function KnowledgeBaseArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data, error }, actor] = await Promise.all([
    supabaseServer
      .from("knowledge_base_articles")
      .select(
        "id, title, content, tags, created_by_name, updated_by_name, created_at, updated_at"
      )
      .eq("id", id)
      .single(),
    getCurrentUser(),
  ]);

  if (error || !data) {
    notFound();
  }

  const article = data as ArticleDetail;
  const canEdit = actor?.role === "admin" || actor?.role === "manager";
  const blocks = parseMarkdownLite(article.content);

  const renderedArticle = (
    <>
      <div className="text-sm text-[#6b705c]">
        {article.created_at === article.updated_at ? (
          <p>
            Added {formatDateOnly(article.created_at)}
            {article.created_by_name ? ` by ${article.created_by_name}` : ""}
          </p>
        ) : (
          <p>
            Updated {formatDateOnly(article.updated_at)}
            {article.updated_by_name ? ` by ${article.updated_by_name}` : ""}
          </p>
        )}
      </div>

      {article.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {article.tags.map((tag) => (
            <Link
              key={tag}
              href={`/knowledge-base?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-[#f0eee6] px-2.5 py-1 text-xs font-semibold capitalize text-[#6b705c] transition hover:bg-[#e7e2d5]"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-[#eee9dc] pt-6 text-[#174734]">
        {blocks.map((block, index) => renderBlock(block, index))}
      </div>
    </>
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Knowledge Base
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              {article.title}
            </h1>
          </div>

          <Link
            href="/knowledge-base"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Knowledge Base
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          {canEdit ? (
            <ArticleViewOrEdit
              articleId={article.id}
              title={article.title}
              tagsString={article.tags.join(", ")}
              content={article.content}
            >
              {renderedArticle}
            </ArticleViewOrEdit>
          ) : (
            renderedArticle
          )}
        </section>
      </div>
    </main>
  );
}
