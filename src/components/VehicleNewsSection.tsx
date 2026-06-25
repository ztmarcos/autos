"use client";

import type { VehicleNewsItem } from "@/lib/vehicle-news";

interface VehicleNewsSectionProps {
  items: VehicleNewsItem[];
  lastUpdated?: string;
}

const SEVERITY_STYLES: Record<
  VehicleNewsItem["severity"],
  { border: string; badge: string; label: string }
> = {
  urgent: {
    border: "border-red-200 bg-red-50/80",
    badge: "bg-red-100 text-red-800",
    label: "Urgente",
  },
  warning: {
    border: "border-amber-200 bg-amber-50/80",
    badge: "bg-amber-100 text-amber-900",
    label: "Aviso",
  },
  info: {
    border: "border-sky-200 bg-sky-50/60",
    badge: "bg-sky-100 text-sky-900",
    label: "Info",
  },
};

function formatUpdatedAt(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VehicleNewsSection({ items, lastUpdated }: VehicleNewsSectionProps) {
  const updatedLabel = formatUpdatedAt(lastUpdated);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-black/40">
          Avisos
        </p>
        {updatedLabel && (
          <p className="text-[11px] text-black/35">Actualizado {updatedLabel}</p>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-black/8 bg-black/[0.02] px-3 py-3 text-[14px] text-black/50">
          Sin avisos hoy para este auto.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const style = SEVERITY_STYLES[item.severity];
            return (
              <li
                key={item.id}
                className={`rounded-xl border px-3 py-3 ${style.border}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-medium leading-snug">{item.title}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
                  >
                    {style.label}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-black/65">
                  {item.summary}
                </p>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[13px] text-black underline underline-offset-2"
                  >
                    Ver fuente ↗
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
