"use client";

import { useEffect, useRef, useState } from "react";
import { getDocumentBytes, getDocumentDownloadUrl } from "@/lib/documents";

interface PdfViewerProps {
  storagePath: string;
  className?: string;
}

const LOAD_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    const workerUrl = `${window.location.origin}/pdf.worker.min.mjs`;
    try {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: "module" });
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
  }
  return pdfjs;
}

export function PdfViewer({ storagePath, className = "" }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Descargando PDF…");
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    if (!container) return;

    async function renderPdf() {
      setLoading(true);
      setError(null);
      setPageCount(0);
      setOpenUrl(null);
      setStatus("Descargando PDF…");
      container!.replaceChildren();

      try {
        const data = await withTimeout(
          getDocumentBytes(storagePath),
          LOAD_TIMEOUT_MS,
          "La descarga del PDF tardó demasiado",
        );
        if (!active) return;

        setStatus("Preparando visor…");
        const pdfjs = await loadPdfJs();
        if (!active) return;

        const pdf = await withTimeout(
          pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: true }).promise,
          LOAD_TIMEOUT_MS,
          "No se pudo procesar el PDF",
        );
        if (!active) return;

        setPageCount(pdf.numPages);
        setStatus(`Renderizando ${pdf.numPages} página${pdf.numPages === 1 ? "" : "s"}…`);
        setLoading(false);

        const width = Math.max(container!.clientWidth - 16, 280);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (!active) return;

          const page = await pdf.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = width / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.className = "mx-auto block max-w-full bg-white shadow-sm";

          context.scale(dpr, dpr);
          await page.render({ canvas, canvasContext: context, viewport }).promise;

          const wrapper = document.createElement("div");
          wrapper.className = "flex justify-center px-2 pb-3";
          wrapper.appendChild(canvas);
          container!.appendChild(wrapper);

          if (pageNum < pdf.numPages) {
            setStatus(`Página ${pageNum} de ${pdf.numPages}`);
          }
        }

        if (active) setStatus("");
      } catch (err) {
        if (!active) return;
        console.error("PdfViewer error:", err);
        let url: string | null = null;
        try {
          url = await getDocumentDownloadUrl(storagePath);
          if (active) setOpenUrl(url);
        } catch {
          // ignore
        }
        const message =
          err instanceof Error ? err.message : "No se pudo cargar el PDF en el visor";
        setError(message);
        setLoading(false);

        // Fallback: iframe can display PDFs without CORS (no JS byte access).
        if (url && container) {
          container.replaceChildren();
          const iframe = document.createElement("iframe");
          iframe.src = `${url}#toolbar=0&navpanes=0&view=FitH`;
          iframe.title = "Vista previa PDF";
          iframe.className = "h-full min-h-[70vh] w-full border-0 bg-white";
          container.appendChild(iframe);
        }
      }
    }

    void renderPdf();
    return () => {
      active = false;
    };
  }, [storagePath]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      {loading && (
        <p className="shrink-0 p-4 text-center text-sm text-black/40">{status}</p>
      )}
      {error && (
        <div className="shrink-0 space-y-2 p-4 text-center text-sm text-black/70">
          <p>{error}</p>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-black/15 px-4 py-2 text-xs font-medium text-black"
            >
              Abrir PDF en navegador
            </a>
          )}
        </div>
      )}
      {!loading && pageCount > 1 && !error && (
        <p className="shrink-0 border-b border-black/5 px-4 py-1.5 text-center text-[11px] text-black/40">
          {pageCount} páginas · desliza para ver todas
        </p>
      )}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-black/[0.03] py-2 [-webkit-overflow-scrolling:touch]"
      />
    </div>
  );
}
