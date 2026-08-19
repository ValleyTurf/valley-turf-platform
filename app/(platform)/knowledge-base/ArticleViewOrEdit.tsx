"use client";

// Manager/admin view of an article: read view by default, with an Edit
// button that swaps in the same ArticleForm used for creation (prefilled)
// instead of navigating to a separate /edit route — there's no
// MANAGER_PLUS_PREFIXES entry that could cleanly isolate
// /knowledge-base/[id]/edit from /knowledge-base/[id] (both share the
// same prefix), so gating happens here (component only renders for
// managers/admins — see [id]/page.tsx) and in updateArticle/deleteArticle
// themselves via requireManager(), not via a route.
import { useState, type ReactNode } from "react";
import ArticleForm from "./ArticleForm";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { updateArticle, deleteArticle } from "./actions";

export default function ArticleViewOrEdit({
  articleId,
  title,
  tagsString,
  content,
  children,
}: {
  articleId: string;
  title: string;
  tagsString: string;
  content: string;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const boundUpdate = updateArticle.bind(null, articleId);
  const boundDelete = deleteArticle.bind(null, articleId);

  if (editing) {
    return (
      <ArticleForm
        action={boundUpdate}
        defaultTitle={title}
        defaultTags={tagsString}
        defaultContent={content}
        submitLabel="Save Changes"
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div>
      {children}

      <div className="mt-6 flex flex-wrap gap-3 border-t border-[#eee9dc] pt-6">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-xl border border-[#174734] px-5 py-2.5 text-sm font-bold transition hover:bg-[#f5f4ef]"
        >
          Edit Article
        </button>

        <form action={boundDelete}>
          <ConfirmSubmitButton
            confirmMessage="Delete this article? This can't be undone."
            className="rounded-xl border border-red-300 px-5 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50"
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
