import { StatusDot } from "@/components/StatusDot";

const LEGEND_ITEMS = [
  { status: "ok" as const, label: "Al día", detail: "más de 7 días" },
  { status: "warning" as const, label: "Vence pronto", detail: "7 días o menos" },
  { status: "danger" as const, label: "Vencida", detail: "fecha pasada" },
];

export function ExpiryStatusLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-1.5 rounded-lg bg-black/[0.03] px-3 py-2.5 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-black/40">
        Semáforo
      </p>
      <ul className="space-y-1">
        {LEGEND_ITEMS.map(({ status, label, detail }) => (
          <li key={status} className="flex items-center gap-2 text-[12px] text-black/55">
            <StatusDot status={status} />
            <span>
              <span className="font-medium text-black/70">{label}</span>
              <span className="text-black/45"> · {detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
