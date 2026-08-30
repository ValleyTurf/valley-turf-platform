"use client";

// Interactive half of /tasks -- add/toggle/delete, all via useTransition
// so a click updates the UI without a full page navigation. No local
// copy of the task list is held in state: revalidatePath("/tasks") in
// each server action re-renders the parent server component with fresh
// data, which flows back down as a new `tasks` prop automatically.
import { useState, useTransition, type FormEvent } from "react";
import { addTask, toggleTask, deleteTask } from "./actions";

export type TaskRow = {
  id: string;
  description: string;
  is_done: boolean;
  created_by_name: string | null;
  created_at: string;
};

export default function TaskList({ tasks }: { tasks: TaskRow[] }) {
  const [newTask, setNewTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openTasks = tasks.filter((task) => !task.is_done);
  const doneTasks = tasks.filter((task) => task.is_done);

  function handleAdd(event: FormEvent) {
    event.preventDefault();

    const description = newTask.trim();

    if (!description) {
      return;
    }

    startTransition(async () => {
      const result = await addTask(description);

      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setNewTask("");
      }
    });
  }

  function handleToggle(id: string, isDone: boolean) {
    startTransition(async () => {
      const result = await toggleTask(id, isDone);

      if (result.error) {
        setError(result.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteTask(id);

      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleAdd}
        className="flex gap-2 rounded-2xl bg-white p-4 shadow"
      >
        <input
          type="text"
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          placeholder="Add a task..."
          className="flex-1 rounded-xl border border-[#d9d4c6] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isPending || !newTask.trim()}
          className="rounded-xl bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-white p-3 text-sm text-red-600 shadow">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow">
        {openTasks.length === 0 ? (
          <p className="text-sm text-[#6b705c]">
            No open tasks. Add one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {openTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-xl border border-[#e6e2d8] px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleToggle(task.id, true)}
                  disabled={isPending}
                  className="mt-1 h-4 w-4 accent-[#174734]"
                />

                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#174734]">
                    {task.description}
                  </p>

                  {task.created_by_name && (
                    <p className="text-xs text-[#9c9990]">
                      Added by {task.created_by_name}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  disabled={isPending}
                  className="text-xs font-bold text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {doneTasks.length > 0 && (
        <details className="rounded-2xl bg-white p-4 shadow">
          <summary className="cursor-pointer text-sm font-bold text-[#6b705c]">
            Completed ({doneTasks.length})
          </summary>

          <ul className="mt-3 space-y-2">
            {doneTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-3 rounded-xl border border-[#e6e2d8] px-3 py-2 opacity-60"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => handleToggle(task.id, false)}
                  disabled={isPending}
                  className="mt-1 h-4 w-4 accent-[#174734]"
                />

                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#174734] line-through">
                    {task.description}
                  </p>

                  {task.created_by_name && (
                    <p className="text-xs text-[#9c9990]">
                      Added by {task.created_by_name}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  disabled={isPending}
                  className="text-xs font-bold text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
