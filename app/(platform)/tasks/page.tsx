export const dynamic = "force-dynamic";
export const revalidate = 0;

// Shared team task list -- flat add/check-off/delete, no assignees or
// due dates. Gated under general_access, same section as Dashboard,
// Schedule, and Customer Map.
import { supabaseServer } from "@/lib/supabase-server";
import TaskList, { type TaskRow } from "./TaskList";

export default async function TasksPage() {
  const { data, error } = await supabaseServer
    .from("tasks")
    .select("id, description, is_done, created_by_name, created_at")
    .order("is_done", { ascending: true })
    .order("created_at", { ascending: true });

  const tasks = (data ?? []) as TaskRow[];

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 text-[#174734] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9c7a20]">
            Valley Turf Revival OS
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Task List</h1>

          <p className="mt-2 text-sm text-[#6b705c]">
            Shared across the team -- add a task, check it off, or delete
            it. Nothing here is assigned or dated, just a running list.
          </p>
        </header>

        {error ? (
          <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow">
            <p className="font-bold text-red-700">Tasks could not be loaded</p>
            <p className="mt-1 text-sm text-red-600">{error.message}</p>
          </section>
        ) : (
          <div className="mt-5">
            <TaskList tasks={tasks} />
          </div>
        )}
      </div>
    </main>
  );
}
