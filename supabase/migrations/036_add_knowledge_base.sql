-- Native Knowledge Base — SOPs, policies, and procedures crew can pull up
-- on their phone from the same app they already use for My Day, instead
-- of a separate Notion/Google Doc they'd have to remember to check.
--
-- Deliberately no role_permissions section for this one. Every other
-- feature in this app uses the configurable role_permissions system
-- (see 013_add_quotes.sql) to gate whether a role can see a whole page
-- at all — but the entire point of a knowledge base is that field crew
-- can actually read it, so viewing is open to every logged-in role
-- unconditionally, the same way My Day and Timeclock are (see
-- lib/permissionRules.ts — routes simply left out of every prefix list).
-- Only creating/editing/deleting articles is restricted, to manager and
-- admin, enforced in-app via lib/currentUser.ts's requireManager() plus
-- the /knowledge-base/new route being added to MANAGER_PLUS_PREFIXES —
-- not via a DB-level permission row, since there's no "view" to toggle.
--
-- Run this once in the Supabase SQL editor (Project vasskxstyvshfiwgpuxj
-- -> SQL Editor).

create table if not exists knowledge_base_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Markdown-lite: blank-line-separated paragraphs, "- "/"* " bullet
  -- lists, "# "/"## " headers, **bold** inline — parsed by
  -- lib/knowledgeBase.ts, not a full markdown library. Stored as plain
  -- text either way.
  content text not null,
  -- Freeform, staff-typed tags rather than a fixed category list — e.g.
  -- "safety", "mowing", "chemical handling". Powers the tag-filter chips
  -- on the list page. Empty array, not null, when an article has none.
  tags text[] not null default '{}',

  created_by uuid references users(id) on delete set null,
  created_by_name text,
  updated_by uuid references users(id) on delete set null,
  updated_by_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_base_articles_updated_at_idx
  on knowledge_base_articles (updated_at desc);

-- GIN index so "articles tagged X" (the tag-filter chips) stays fast as
-- the library grows, same reasoning as any array-containment lookup.
create index if not exists knowledge_base_articles_tags_idx
  on knowledge_base_articles using gin (tags);
