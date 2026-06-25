"use client";

import { useMemo, useRef, useState } from "react";
import type { DocumentType, VehicleDocument } from "@/lib/types";
import { getDocumentLabel, isAcceptedFileType, uploadDocument } from "@/lib/documents";
import { DocumentThumbnail } from "@/components/DocumentThumbnail";

interface DocumentGridProps {
  userId: string;
  vehicleId: string;
  documents: VehicleDocument[];
  onSelect: (doc: VehicleDocument) => void;
  types?: DocumentType[];
  hintType?: DocumentType;
  title?: string;
  uploadLabel?: string;
}

function DocumentCard({
  doc,
  onSelect,
}: {
  doc: VehicleDocument;
  onSelect: () => void;
}) {
  const loading = doc.status === "uploading" || doc.status === "processing";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={loading}
      className="flex w-24 shrink-0 flex-col gap-1.5 text-left"
    >
      <div className="h-28 w-24">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-black/10 bg-black/[0.03]">
            <span className="animate-pulse text-[11px] text-black/40">…</span>
          </div>
        ) : (
          <DocumentThumbnail doc={doc} variant="card" className="h-full w-full" />
        )}
      </div>
      <span className="line-clamp-2 text-[11px] leading-tight text-black/70">
        {getDocumentLabel(doc)}
      </span>
    </button>
  );
}

function matchesTypes(
  doc: VehicleDocument,
  types: DocumentType[],
  hintType?: DocumentType,
): boolean {
  if (doc.detectedType && types.includes(doc.detectedType)) return true;
  if (
    hintType &&
    types.includes(hintType) &&
    doc.status !== "ready" &&
    doc.detectedType === hintType
  ) {
    return true;
  }
  return false;
}

export function DocumentGrid({
  userId,
  vehicleId,
  documents,
  onSelect,
  types,
  hintType,
  title = "Documentos",
  uploadLabel = "Subir",
}: DocumentGridProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(() => {
    if (!types || types.length === 0) return documents;
    return documents.filter((doc) => matchesTypes(doc, types, hintType));
  }, [documents, types, hintType]);

  async function handleFile(file: File) {
    if (
      !isAcceptedFileType(file.type) &&
      !file.name.match(/\.(pdf|xml|xls|xlsx|jpg|jpeg|png|heic)$/i)
    ) {
      alert("Formato no soportado");
      return;
    }
    setUploading(true);
    try {
      await uploadDocument(userId, vehicleId, file, hintType ? { hintType } : undefined);
    } catch (e) {
      console.error(e);
      alert("Error al subir documento");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mb-5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
        {title}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {filtered.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} onSelect={() => onSelect(doc)} />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-24 shrink-0 flex-col gap-1.5"
        >
          <div className="flex h-28 w-24 items-center justify-center rounded-lg border border-dashed border-black/25">
            <span className="text-2xl text-black">{uploading ? "…" : "+"}</span>
          </div>
          <span className="line-clamp-2 text-[11px] leading-tight text-black/50">
            {uploadLabel}
          </span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.xls,.xlsx,.xml,image/*,application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
