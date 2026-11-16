"use client";

// Submit button that asks "are you sure" first -- a merge cannot be
// undone from the app (a copy of the removed customer is saved).
export default function MergeButton({
  label,
  confirmText,
  className,
}: {
  label: string;
  confirmText: string;
  className: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
