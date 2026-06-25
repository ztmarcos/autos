"use client";

import { useEffect, useState } from "react";

interface ClickToEditFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  emptyLabel?: string;
  inputType?: "text" | "number" | "date";
  mono?: boolean;
  editing: boolean;
  saving?: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
  renderInput?: (props: {
    value: string;
    onChange: (value: string) => void;
  }) => React.ReactNode;
}

export function ClickToEditField({
  label,
  value,
  placeholder,
  emptyLabel = "Agregar",
  inputType = "text",
  mono = false,
  editing,
  saving = false,
  onStartEdit,
  onCancel,
  onSave,
  renderInput,
}: ClickToEditFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  const display = value.trim() || emptyLabel;
  const isEmpty = !value.trim();

  if (editing) {
    return (
      <div className="border-b border-black/10 py-2.5">
        <span className="mb-1.5 block text-[13px] text-black/50">{label}</span>
        {renderInput ? (
          renderInput({ value: draft, onChange: setDraft })
        ) : (
          <input
            type={inputType}
            inputMode={inputType === "number" ? "numeric" : undefined}
            className={`field-input w-full ${mono ? "font-mono text-[13px]" : ""}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="flex-1 rounded-lg border border-black/15 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave(draft)}
            className="flex-1 rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      className="flex w-full items-start justify-between gap-3 border-b border-black/10 py-2.5 text-left transition hover:bg-black/[0.02]"
    >
      <span className="text-[13px] text-black/50">{label}</span>
      <span
        className={`min-w-0 text-right text-[15px] ${
          isEmpty ? "text-black/35 italic" : ""
        } ${mono ? "font-mono text-[13px]" : ""}`}
      >
        {display}
      </span>
    </button>
  );
}

interface ClickToEditSelectFieldProps {
  label: string;
  value: string;
  displayValue: string;
  emptyLabel?: string;
  editing: boolean;
  saving?: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => Promise<void>;
  children: React.ReactNode;
}

export function ClickToEditSelectField({
  label,
  value,
  displayValue,
  emptyLabel = "Agregar",
  editing,
  saving = false,
  onStartEdit,
  onCancel,
  onSave,
  children,
}: ClickToEditSelectFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  const isEmpty = !value.trim();

  if (editing) {
    return (
      <div className="border-b border-black/10 py-2.5">
        <span className="mb-1.5 block text-[13px] text-black/50">{label}</span>
        <select
          className="field-input w-full"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        >
          {children}
        </select>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="flex-1 rounded-lg border border-black/15 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave(draft)}
            className="flex-1 rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      className="flex w-full items-start justify-between gap-3 border-b border-black/10 py-2.5 text-left transition hover:bg-black/[0.02]"
    >
      <span className="text-[13px] text-black/50">{label}</span>
      <span className={`text-right text-[15px] ${isEmpty ? "text-black/35 italic" : ""}`}>
        {isEmpty ? emptyLabel : displayValue}
      </span>
    </button>
  );
}
