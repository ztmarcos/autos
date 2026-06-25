"use client";

import { useEffect, useState } from "react";
import { getDocumentDownloadUrl } from "@/lib/documents";
import { getPdfPageImageUrls } from "@/lib/pdf-pages";

interface MobilePdfScrollProps {
  storagePath: string;
}

export function MobilePdfScroll({ storagePath }: MobilePdfScrollProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [pageUrls, setPageUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setOpenUrl(null);
      setPageUrls([]);

      try {
        const urls = await getPdfPageImageUrls(storagePath);
        if (cancelled) return;
        if (urls.length === 0) throw new Error("PDF sin páginas");
        setPageUrls(urls);
      } catch (err) {
        if (cancelled) return;
        console.error("MobilePdfScroll:", err);
        try {
          const url = await getDocumentDownloadUrl(storagePath);
          if (!cancelled) setOpenUrl(url);
        } catch {
          // ignore
        }
        setError("No se pudo mostrar el PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {loading && (
        <p className="shrink-0 p-2 text-center text-sm text-black/40">
          Preparando páginas…
        </p>
      )}
      {error && (
        <div className="shrink-0 space-y-2 p-4 text-center text-sm text-black/60">
          <p>{error}</p>
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-black/15 px-4 py-2 text-xs font-medium text-black"
            >
              Abrir en navegador
            </a>
          )}
        </div>
      )}
      {!loading && pageUrls.length > 0 && !error && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {pageUrls.length > 1 && (
            <p className="sticky top-0 z-10 border-b border-black/5 bg-[#f0f0f0]/95 py-1 text-center text-[11px] text-black/40 backdrop-blur-sm">
              {pageUrls.length} páginas · desliza para ver todas
            </p>
          )}
          {pageUrls.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${storagePath}-${index}`}
              src={url}
              alt={`Página ${index + 1}`}
              className="mx-auto block w-full max-w-full bg-white shadow-sm"
            />
          ))}
        </div>
      )}
    </div>
  );
}
