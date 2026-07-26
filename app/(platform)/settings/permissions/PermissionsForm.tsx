"use client";

import { useActionState } from "react";
import { updatePermissions } from "./actions";
import { initialActionState } from "./actionState";
import type { PermissionSection } from "@/lib/permissions";

type SectionInfo = {
  id: PermissionSection;
  label: string;
  description: string;
};

type Permissions = {
  manager: Record<PermissionSection, boolean>;
  staff: Record<PermissionSection, boolean>;
};

export function PermissionsForm({
  sections,
  permissions,
}: {
  sections: SectionInfo[];
  permissions: Permissions;
}) {
  const [state, formAction, isPending] = useActionState(
    updatePermissions,
    initialActionState
  );

  return (
    <form action={formAction}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#e7e2d5] text-left">
              <th className="py-2 pr-3 font-bold">Section</th>
              <th className="py-2 px-3 text-center font-bold">Admin</th>
              <th className="py-2 px-3 text-center font-bold">Manager</th>
              <th className="py-2 pl-3 text-center font-bold">Staff</th>
            </tr>
          </thead>

          <tbody>
            {sections.map((section) => (
              <tr
                key={section.id}
                className="border-b border-[#f0ead9] align-top"
              >
                <td className="py-3 pr-3">
                  <p className="font-semibold">{section.label}</p>
                  <p className="mt-0.5 text-xs text-[#6b705c]">
                    {section.description}
                  </p>
                </td>

                <td className="py-3 px-3 text-center text-xs font-bold uppercase text-[#9c7a20]">
                  Full
                </td>

                <td className="py-3 px-3 text-center">
                  <input
                    type="checkbox"
                    name={`manager__${section.id}`}
                    defaultChecked={permissions.manager[section.id]}
                    className="h-4 w-4"
                  />
                </td>

                <td className="py-3 pl-3 text-center">
                  <input
                    type="checkbox"
                    name={`staff__${section.id}`}
                    defaultChecked={permissions.staff[section.id]}
                    className="h-4 w-4"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error && (
        <p className="mt-3 text-sm font-semibold text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-4 rounded-lg bg-[#174734] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#226246] disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save Permissions"}
      </button>
    </form>
  );
}
