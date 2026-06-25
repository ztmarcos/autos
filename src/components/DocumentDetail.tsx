"use client";

import { useEffect, useState } from "react";
import type { VehicleDocument } from "@/lib/types";
import { getSchema } from "@/config/document-schemas";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getDocumentLabel,
  isPhoneFieldKey,
  renameDocument,
  updateDocumentFields,
} from "@/lib/documents";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";

interface DocumentDetailProps {
  vehicleId: string;
  document: VehicleDocument;
  onBack: () => void;
}

export function DocumentDetail({
  vehicleId,
  document: doc,
  onBack,
}: DocumentDetailProps) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [fields, setFields] = useState<Record<string, string | number | null>>(
    doc.extractedFields ?? {},
  );

  useEffect(() => {
    setFields(doc.extractedFields ?? {});
  }, [doc]);

  const schema = doc.detectedType ? getSchema(doc.detectedType) : null;
  const title = getDocumentLabel(doc);

  function startRename() {
    setNameDraft(doc.displayName?.trim() || title);
    setRenameError(null);
    setRenaming(true);
  }

  async function handleSaveName() {
    setSavingName(true);
    setRenameError(null);
    try {
      await renameDocument(vehicleId, doc.id, nameDraft);
      setRenaming(false);
    } catch (err) {
      console.error(err);
      setRenameError("No se pudo guardar el nombre.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSave() {
    await updateDocumentFields(vehicleId, doc.id, fields);
    setEditing(false);
  }

  async function openOriginal() {
    const url = await getDocumentDownloadUrl(doc.storagePath);
    window.open(url, "_blank");
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDocument(vehicleId, doc);
      onBack();
    } catch (err) {
      console.error(err);
      setDeleteError("No se pudo eliminar el documento. Intenta de nuevo.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function formatPhoneLink(value: string | number): string {
    const digits = String(value).replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("52") ? `+${digits}` : digits.length === 10 ? `+52${digits}` : `+${digits}`;
  }

  function renderFieldValue(key: string, val: string | number | null | undefined) {
    if (val == null || val === "") return null;
    if (isPhoneFieldKey(key)) {
      const href = formatPhoneLink(val);
      if (!href) return String(val);
      return (
        <a href={`tel:${href}`} className="font-medium underline underline-offset-2">
          {String(val)}
        </a>
      );
    }
    return String(val);
  }

  const visibleFields = schema
    ? schema.fields.filter((f) => editing || (fields[f.key] != null && fields[f.key] !== ""))
    : Object.entries(fields)
        .filter(([, value]) => editing || (value != null && value !== ""))
        .map(([key]) => ({ key, label: key }));

  const showCapturedSection =
    doc.status === "ready" && (editing || visibleFields.length > 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-black/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="link-back shrink-0">
            ← Volver
          </button>
          {renaming ? (
            <input
              className="field-input min-w-0 flex-1 text-base font-semibold"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Ejemplo: Póliza 2026"
              autoFocus
              disabled={savingName}
            />
          ) : (
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h2>
          )}
        </div>

        {!renaming && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={openOriginal}
              className="shrink-0 rounded-full border border-black/15 px-3 py-1 text-xs text-black"
            >
              Ver original
            </button>
            <button
              type="button"
              onClick={startRename}
              disabled={deleting}
              className="shrink-0 rounded-full border border-black/15 px-3 py-1 text-xs text-black disabled:opacity-40"
            >
              Renombrar
            </button>
            {doc.status === "ready" && (
              <button
                type="button"
                onClick={editing ? handleSave : () => setEditing(true)}
                disabled={deleting}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  editing ? "btn-primary" : "border border-black/15 text-black"
                }`}
              >
                {editing ? "Guardar datos" : "Editar datos"}
              </button>
            )}
          </div>
        )}

        {renaming && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenaming(false)}
              disabled={savingName}
              className="shrink-0 text-xs text-black/50 underline underline-offset-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName || !nameDraft.trim()}
              className="btn-primary shrink-0 px-3 py-1.5 text-xs"
            >
              {savingName ? "…" : "Guardar nombre"}
            </button>
          </div>
        )}
      </div>

      {renameError && (
        <p className="shrink-0 border-b border-black/10 px-4 py-2 text-sm text-black/70">
          {renameError}
        </p>
      )}

      {deleteError && (
        <p className="shrink-0 border-b border-black/10 px-4 py-2 text-sm text-black/70">
          {deleteError}
        </p>
      )}

      {doc.status === "error" && (
        <p className="shrink-0 border-b border-black/10 px-4 py-2 text-sm text-black/70">
          {doc.errorMessage ?? "Error al procesar"}
        </p>
      )}

      {(doc.status === "processing" || doc.status === "uploading") && (
        <p className="shrink-0 border-b border-black/10 px-4 py-2 text-sm text-black/50">
          Analizando documento…
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showCapturedSection && (
          <section className="shrink-0 overflow-hidden border-b border-black/10 bg-black/[0.02] max-h-[32dvh]">
            <p className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-black/40">
              Datos capturados
            </p>

            <div className="overflow-y-auto px-4 pb-3">
              <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {schema
                  ? schema.fields.map((f) => {
                      const val = fields[f.key];
                      if (!editing && (val == null || val === "")) return null;
                      return (
                        <div key={f.key} className="flex min-w-0 justify-between gap-2 py-0.5">
                          <dt className="shrink-0 text-[11px] text-black/45">{f.label}</dt>
                          <dd className="min-w-0 truncate text-right text-[13px] font-medium">
                            {editing ? (
                              <input
                                className="field-input w-full text-right text-[13px]"
                                value={String(fields[f.key] ?? "")}
                                onChange={(e) =>
                                  setFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                                }
                              />
                            ) : (
                              renderFieldValue(f.key, val)
                            )}
                          </dd>
                        </div>
                      );
                    })
                  : visibleFields.map((f) => (
                      <div key={f.key} className="flex min-w-0 justify-between gap-2 py-0.5">
                        <dt className="shrink-0 text-[11px] text-black/45">{f.label}</dt>
                        <dd className="min-w-0 truncate text-right text-[13px] font-medium">
                          {String(fields[f.key] ?? "")}
                        </dd>
                      </div>
                    ))}
              </dl>
            </div>
          </section>
        )}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f0f0f0]">
          <DocumentThumbnail doc={doc} variant="viewer" className="min-h-0 flex-1" />
        </section>
      </div>

      {!renaming && (
        <div className="shrink-0 border-t border-black/10 bg-white px-4 py-3">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-sm text-black/70">
                ¿Eliminar &quot;{title}&quot;? No se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 rounded-lg border border-black/15 py-2.5 text-sm text-black"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 rounded-lg bg-black py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="w-full py-2.5 text-sm text-black/60 underline underline-offset-2 disabled:opacity-40"
            >
              Eliminar documento
            </button>
          )}
        </div>
      )}
    </div>
  );
}
