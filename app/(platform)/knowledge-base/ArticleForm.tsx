"use client";

// Shared between /knowledge-base/new and the inline edit toggle on
// /knowledge-base/[id] — the only difference between "create" and "edit"
// is which server action gets passed in (updateArticle is already bound
// to the article's id by the caller) and what the fields default to, so
// there's no reason to maintain two near-identical forms.
import { useActionState } from "react";
import { initialActionState, type ActionState } from "./actionState";

export default function ArticleForm({
  action,
  defaultTitle = "",
  defaultTags = "",
  defaultContent = "",
  submitLabel,
  onCancel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  defaultTitle?: string;
  defaultTags?: string;
  defaultContent?: string;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title" className="text-xs font-bold text-[#9c7a20]">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={defaultTitle}
          placeholder="e.g. Mower Safety Checklist"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
      </div>

      <div>
        <label htmlFor="tags" className="text-xs font-bold text-[#9c7a20]">
          Tags
        </label>
        <input
          id="tags"
          name="tags"
          type="text"
          defaultValue={defaultTags}
          placeholder="e.g. safety, equipment, mowing"
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
        <p className="mt-1 text-xs text-[#6b705c]">
          Comma-separated. Used for the filter chips on the Knowledge Base
          list.
        </p>
      </div>

      <div>
        <label htmlFor="content" className="text-xs font-bold text-[#9c7a20]">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          required
          rows={16}
          defaultValue={defaultContent}
          placeholder={
            "# Section Heading\n\nWrite a paragraph like this. Leave a blank line between paragraphs.\n\n- Bullet point one\n- Bullet point two\n\nUse **double asterisks** for bold."
          }
          className="mt-1 w-full rounded-lg border border-[#d9d4c6] px-3 py-2 font-mono text-sm outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
        />
        <p className="mt-1 text-xs text-[#6b705c]">
          Plain text with light formatting: blank lines between
          paragraphs, lines starting with &quot;# &quot; or &quot;## &quot;
          for headings, lines starting with &quot;- &quot; for bullet
          lists, and **double asterisks** for bold.
        </p>
      </div>

      {state.error && (
        <p className="text-sm font-semibold text-red-600">{state.error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-[#174734] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#d8d3c6] px-6 py-3 text-sm font-bold text-[#6b705c] transition hover:border-[#d4af37]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
