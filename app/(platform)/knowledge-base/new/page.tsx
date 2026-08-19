export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import ArticleForm from "../ArticleForm";
import { createArticle } from "../actions";

export default function NewArticlePage() {
  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
              Valley Turf Revival OS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              New Article
            </h1>
            <p className="mt-2 max-w-2xl text-[#6b705c]">
              Add a new SOP, policy, or procedure to the Knowledge Base.
              Every crew member can read it as soon as it&apos;s saved.
            </p>
          </div>

          <Link
            href="/knowledge-base"
            className="rounded-xl border border-[#174734] px-5 py-3 text-center text-sm font-bold transition hover:bg-white"
          >
            Back to Knowledge Base
          </Link>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-5 shadow sm:p-8">
          <ArticleForm action={createArticle} submitLabel="Publish Article" />
        </section>
      </div>
    </main>
  );
}
