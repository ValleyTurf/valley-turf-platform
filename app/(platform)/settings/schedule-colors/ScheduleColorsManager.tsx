"use client";

// Client component for /settings/schedule-colors -- same reasoning as
// ReferralSourcesManager.tsx: add/edit/delete/reorder each need inline
// feedback without a full page reload, via useTransition.
import { useState, useTransition } from "react";
import {
  NAMED_COLORS,
  NAMED_COLOR_KEYS,
  type NamedColorKey,
  type ServiceColorRule,
} from "@/lib/scheduleServiceColorPalette";
import {
  addServiceColorRule,
  deleteServiceColorRule,
  moveServiceColorRule,
  updateServiceColorRule,
} from "./actions";

// Keywords are stored already-normalized (lowercase, no hyphens) --
// this is purely a display join, not what gets saved; saving always
// re-parses straight from the text field via parseServiceColorKeywords.
function formatKeywords(keywords: string[]): string {
  return keywords.join(", ");
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: NamedColorKey;
  onChange: (key: NamedColorKey) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {NAMED_COLOR_KEYS.map((key) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(key)}
            title={key}
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: NAMED_COLORS[key].hex,
              border: selected
                ? "3px solid #0f172a"
                : "2px solid rgba(15, 23, 42, 0.12)",
              cursor: disabled ? "default" : "pointer",
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

function RuleForm({
  initialLabel,
  initialKeywords,
  initialColorKey,
  showKeywords,
  busy,
  onSave,
  onCancel,
}: {
  initialLabel: string;
  initialKeywords: string;
  initialColorKey: NamedColorKey;
  showKeywords: boolean;
  busy: boolean;
  onSave: (
    label: string,
    keywordsText: string,
    colorKey: NamedColorKey
  ) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [keywordsText, setKeywordsText] = useState(initialKeywords);
  const [colorKey, setColorKey] = useState<NamedColorKey>(initialColorKey);

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px",
        borderRadius: "12px",
        border: "1px solid #e7e2d5",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 700,
            color: "#64748b",
            marginBottom: "4px",
          }}
        >
          Name (for your own reference)
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Quarterly"
          style={{
            width: "100%",
            maxWidth: "320px",
            padding: "8px 10px",
            borderRadius: "8px",
            border: "1px solid #d9d4c6",
            fontSize: "14px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {showKeywords && (
        <div>
          <label
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 700,
              color: "#64748b",
              marginBottom: "4px",
            }}
          >
            Match words (comma-separated -- a visit&apos;s service title must
            contain ALL of these to get this color)
          </label>
          <input
            type="text"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            placeholder="e.g. full, clean, initial"
            style={{
              width: "100%",
              maxWidth: "420px",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      <div>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 700,
            color: "#64748b",
            marginBottom: "6px",
          }}
        >
          Color
        </label>
        <ColorPicker value={colorKey} onChange={setColorKey} disabled={busy} />
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(label, keywordsText, colorKey)}
          style={{
            borderRadius: "8px",
            border: "none",
            background: "#174734",
            color: "white",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 14px",
            cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            borderRadius: "8px",
            border: "1px solid #d9d4c6",
            background: "white",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Swatch({ colorKey }: { colorKey: NamedColorKey }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: NAMED_COLORS[colorKey].hex,
        flexShrink: 0,
      }}
    />
  );
}

function Row({
  rule,
  isFirst,
  isLast,
}: {
  rule: ServiceColorRule;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave(
    label: string,
    keywordsText: string,
    colorKey: NamedColorKey
  ) {
    setError(null);
    startTransition(async () => {
      const result = await updateServiceColorRule(
        rule.id,
        label,
        keywordsText,
        colorKey
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteServiceColorRule(rule.id);
      if (result.error) {
        setError(result.error);
        setConfirmingDelete(false);
      }
    });
  }

  function handleMove(direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveServiceColorRule(rule.id, direction);
      if (result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div
      style={{
        padding: "12px 0",
        borderTop: "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div
          style={{
            flex: "1 1 260px",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Swatch colorKey={rule.colorKey} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
              {rule.label}
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>
              Matches titles containing: {formatKeywords(rule.keywords)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            disabled={isPending || isFirst}
            onClick={() => handleMove("up")}
            title="Move up (checked before rules below it)"
            style={{
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              background: "white",
              fontSize: "13px",
              padding: "6px 10px",
              cursor: isFirst ? "default" : "pointer",
              opacity: isFirst ? 0.35 : 1,
            }}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isPending || isLast}
            onClick={() => handleMove("down")}
            title="Move down"
            style={{
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              background: "white",
              fontSize: "13px",
              padding: "6px 10px",
              cursor: isLast ? "default" : "pointer",
              opacity: isLast ? 0.35 : 1,
            }}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            style={{
              borderRadius: "8px",
              border: "1px solid #d9d4c6",
              background: "white",
              fontSize: "12px",
              fontWeight: 700,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            {editing ? "Close" : "Edit"}
          </button>

          {confirmingDelete ? (
            <>
              <span style={{ fontSize: "12px", color: "#dc2626" }}>
                Delete?
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                style={{
                  borderRadius: "8px",
                  border: "1px solid #dc2626",
                  background: "#dc2626",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                style={{
                  borderRadius: "8px",
                  border: "1px solid #d9d4c6",
                  background: "white",
                  fontSize: "12px",
                  fontWeight: 700,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              style={{
                border: "none",
                background: "none",
                color: "#dc2626",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                padding: "6px 4px",
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {editing && (
        <RuleForm
          initialLabel={rule.label}
          initialKeywords={formatKeywords(rule.keywords)}
          initialColorKey={rule.colorKey}
          showKeywords
          busy={isPending}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      )}

      {error && (
        <p style={{ margin: "8px 0 0", color: "#dc2626", fontSize: "12px" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function DefaultRow({ rule }: { rule: ServiceColorRule }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave(
    label: string,
    _keywordsText: string,
    colorKey: NamedColorKey
  ) {
    setError(null);
    startTransition(async () => {
      const result = await updateServiceColorRule(rule.id, label, "", colorKey);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div
      style={{
        background: "#fdfbf5",
        border: "1px solid #e7e2d5",
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Swatch colorKey={rule.colorKey} />
          <div>
            <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
              {rule.label}
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>
              The color for any service that doesn&apos;t match a rule above
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          style={{
            borderRadius: "8px",
            border: "1px solid #d9d4c6",
            background: "white",
            fontSize: "12px",
            fontWeight: 700,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing && (
        <RuleForm
          initialLabel={rule.label}
          initialKeywords=""
          initialColorKey={rule.colorKey}
          showKeywords={false}
          busy={isPending}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      )}

      {error && (
        <p style={{ margin: "8px 0 0", color: "#dc2626", fontSize: "12px" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function ScheduleColorsManager({
  rules,
}: {
  rules: ServiceColorRule[];
}) {
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const orderedRules = rules.filter((r) => !r.isDefault);
  const defaultRule = rules.find((r) => r.isDefault) ?? null;

  function handleAdd(
    label: string,
    keywordsText: string,
    colorKey: NamedColorKey
  ) {
    setAddError(null);
    startTransition(async () => {
      const result = await addServiceColorRule(label, keywordsText, colorKey);
      if (result.error) {
        setAddError(result.error);
        return;
      }
      setAdding(false);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "16px",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "4px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>
            Rules
          </h2>

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                borderRadius: "8px",
                border: "1px solid #174734",
                background: "white",
                color: "#174734",
                fontSize: "13px",
                fontWeight: 700,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              + Add Rule
            </button>
          )}
        </div>

        <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "13px" }}>
          Checked top to bottom -- the first rule whose match words are all
          found in a visit&apos;s service title wins. Reorder with ↑/↓ if two
          rules could both match the same title.
        </p>

        {adding && (
          <RuleForm
            initialLabel=""
            initialKeywords=""
            initialColorKey="emerald"
            showKeywords
            busy={isPending}
            onSave={handleAdd}
            onCancel={() => {
              setAdding(false);
              setAddError(null);
            }}
          />
        )}

        {addError && (
          <p style={{ margin: "8px 0 0", color: "#dc2626", fontSize: "12px" }}>
            {addError}
          </p>
        )}

        {orderedRules.length === 0 ? (
          <p style={{ margin: "12px 0 0", color: "#94a3b8", fontSize: "14px" }}>
            No rules yet -- every service will show the fallback color
            below.
          </p>
        ) : (
          orderedRules.map((rule, index) => (
            <Row
              key={rule.id}
              rule={rule}
              isFirst={index === 0}
              isLast={index === orderedRules.length - 1}
            />
          ))
        )}
      </div>

      {defaultRule && <DefaultRow rule={defaultRule} />}
    </div>
  );
}
