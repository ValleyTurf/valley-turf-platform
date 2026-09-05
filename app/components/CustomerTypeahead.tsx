"use client";

// Shared predictive customer search box -- backs the global search bar
// (app/(platform)/layout.tsx), the /customers list search, and the
// /job-costs visit search. One component, one debounce/keyboard-nav
// implementation, so "start typing, see matches appear" behaves
// identically everywhere instead of three separate one-offs.
//
// Deliberately renders a plain <input>, not a form of its own -- on
// /customers and /job-costs this gets dropped straight into their
// existing <form action="..." method="get"> so the no-JS/plain-Enter
// fallback (their existing full server-side search+pagination) keeps
// working completely unchanged. The dropdown is additive: it only ever
// fires on an explicit click or an arrow-key-then-Enter pick, never by
// hijacking a bare Enter press meant for the surrounding form.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type CustomerSearchResult = {
  jobberClientId: string;
  name: string;
  detail: string;
};

type CustomerTypeaheadProps = {
  id?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  className?: string;
  inputClassName?: string;
  // true (default): picking a suggestion navigates straight to that
  // customer's page -- the global search bar and /customers, where
  // finding one specific customer is the whole point.
  // false: picking a suggestion instead fills the input with the
  // customer's name and submits the surrounding <form> -- /job-costs,
  // where the search narrows a list of VISITS by customer name rather
  // than jumping to a customer record.
  navigateOnSelect?: boolean;
  autoFocus?: boolean;
};

export default function CustomerTypeahead({
  id,
  name = "search",
  placeholder = "Search customers...",
  defaultValue = "",
  className = "",
  inputClassName = "",
  navigateOnSelect = true,
  autoFocus = false,
}: CustomerTypeaheadProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards against an earlier, slower keystroke's response landing after
  // a later one's and clobbering the dropdown with stale results.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = value.trim();
    const requestId = ++requestIdRef.current;

    if (query.length < 2) {
      // Deferred rather than called synchronously in the effect body
      // (React's set-state-in-effect lint rule) -- functionally this
      // still just clears the dropdown on the next tick.
      const clearId = setTimeout(() => {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setOpen(false);
      }, 0);

      return () => clearTimeout(clearId);
    }

    const timeoutId = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(query)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { results?: CustomerSearchResult[] } | null) => {
          if (!data || requestId !== requestIdRef.current) return;

          setResults(data.results ?? []);
          setOpen(true);
          setHighlighted(-1);
        })
        .catch(() => {
          // Network hiccup -- fail silently. The input is still a normal
          // text field wired to the surrounding form, so search still
          // works with no suggestions at all.
        });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectResult(result: CustomerSearchResult) {
    setOpen(false);
    setValue(result.name);

    if (navigateOnSelect) {
      router.push(`/customers/${encodeURIComponent(result.jobberClientId)}`);
      return;
    }

    // Submit the enclosing form with the picked name, same as pressing
    // Enter would -- keeps /job-costs' existing GET-based search and
    // pagination logic working completely unmodified.
    requestAnimationFrame(() => {
      containerRef.current?.closest("form")?.requestSubmit();
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (highlighted >= 0) {
        // A suggestion is actively highlighted via arrow keys -- pick it.
        event.preventDefault();
        selectResult(results[highlighted]);
      } else if (!containerRef.current?.closest("form")) {
        // No enclosing form to fall back on (the standalone global
        // search bar) -- bare Enter picks the top match instead of
        // doing nothing.
        event.preventDefault();
        selectResult(results[0]);
      }
      // Otherwise: let Enter fall through to the surrounding form's
      // normal submit, same as if this dropdown didn't exist.
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        id={id}
        type="search"
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        className={inputClassName}
      />

      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-[#e7e2d5] bg-white shadow-lg">
          {results.map((result, index) => (
            <li key={result.jobberClientId}>
              <button
                type="button"
                onClick={() => selectResult(result)}
                onMouseEnter={() => setHighlighted(index)}
                className={`block w-full px-4 py-2.5 text-left text-sm ${
                  index === highlighted ? "bg-[#faf4e3]" : "hover:bg-[#f7f6f1]"
                }`}
              >
                <p className="font-semibold text-[#174734]">{result.name}</p>
                {result.detail ? (
                  <p className="text-xs text-[#6b705c]">{result.detail}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
