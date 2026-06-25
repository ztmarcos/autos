"use client";

import { useEffect, useState } from "react";
import type { VehicleDocument } from "@/lib/types";
import {
  getDocumentDownloadUrl,
  getThumbnailUrl,
  isPdfDocument,
} from "@/lib/documents";
import { MobilePdfScroll } from "@/components/MobilePdfScroll";

function useMobilePdfViewer() {
  const [mobile, setMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}

interface DocumentThumbnailProps {
  doc: VehicleDocument;
  variant?: "card" | "viewer";
  className?: string;
}

function PdfPlaceholder({ compact }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--status-danger-soft)] text-[#8f3f3f]">
      <span className={compact ? "text-lg font-bold" : "text-2xl font-bold"}>PDF</span>
      {!compact && <span className="mt-1 text-[11px] opacity-70">Cargando…</span>}
    </div>
  );
}

function PdfDesktopIframe({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    getDocumentDownloadUrl(storagePath)
      .then((downloadUrl) => {
        if (active) setUrl(downloadUrl);
      })
      .catch(() => {
        if (active) setError("No se pudo cargar el PDF");
      });
    return () => {
      active = false;
    };
  }, [storagePath]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-black/60">
        {error}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center bg-black/[0.02]">
        <span className="text-sm text-black/40">Cargando PDF…</span>
      </div>
    );
  }

  return (
    <iframe
      src={`${url}#toolbar=1&navpanes=0`}
      title="Vista previa PDF"
      className="h-full w-full border-0 bg-white"
    />
  );
}

function PdfInlineViewer({ storagePath }: { storagePath: string }) {
  const mobile = useMobilePdfViewer();

  if (mobile === null) {
    return (
      <div className="flex h-full items-center justify-center bg-black/[0.02]">
        <span className="text-sm text-black/40">Cargando PDF…</span>
      </div>
    );
  }

  if (mobile) {
    return <MobilePdfScroll storagePath={storagePath} />;
  }

  return <PdfDesktopIframe storagePath={storagePath} />;
}

export function DocumentThumbnail({
  doc,
  variant = "card",
  className = "",
}: DocumentThumbnailProps) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(false);
  const isPdf = isPdfDocument(doc);
  const isViewer = variant === "viewer";

  useEffect(() => {
    let active = true;
    setImgFailed(false);
    setThumb(null);
    setThumbLoading(isPdf && !isViewer);

    getThumbnailUrl(doc)
      .then((url) => {
        if (!active) return;
        if (url) {
          setThumb(url);
          return;
        }
        if (isViewer && !isPdf) {
          return getDocumentDownloadUrl(doc.storagePath).then((original) => {
            if (active) setThumb(original);
          });
        }
      })
      .finally(() => {
        if (active) setThumbLoading(false);
      });

    return () => {
      active = false;
    };
  }, [doc, isPdf, isViewer]);

  const showPdfViewer = isPdf && isViewer;
  const showImage = !isViewer && thumb && !imgFailed;
  const showViewerImage = isViewer && !isPdf && !!thumb && !imgFailed;

  const frameClass = isViewer
    ? `flex h-full min-h-0 w-full flex-col ${className}`
    : `overflow-hidden rounded-lg border border-black/10 bg-black/[0.02] ${className}`;

  return (
    <div className={frameClass}>
      {showPdfViewer ? (
        <PdfInlineViewer storagePath={doc.storagePath} />
      ) : showViewerImage && thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-full w-full bg-black/[0.02] object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : showImage && thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : isPdf && imgFailed && !isViewer ? (
        <PdfPlaceholder compact />
      ) : thumbLoading && !isViewer ? (
        <div className="flex h-full min-h-28 items-center justify-center bg-black/[0.03]">
          <span className="animate-pulse text-[11px] text-black/40">PDF…</span>
        </div>
      ) : isViewer ? (
        <div className="flex h-full items-center justify-center bg-black/[0.02]">
          <span className="text-sm text-black/40">Cargando documento…</span>
        </div>
      ) : (
        <div className="flex h-full min-h-28 items-center justify-center">
          <span className="text-2xl opacity-40">📄</span>
        </div>
      )}
    </div>
  );
}
