import type { VehicleExpiryTag as VehicleExpiryTagData } from "@/lib/types";
import { formatVehicleDisplayDate } from "@/lib/vehicles";
import { StatusDot } from "@/components/StatusDot";

const tagStyles = {
  ok: "bg-black/[0.04] text-black/50",
  warning: "bg-[var(--status-warning-soft)] text-[#8a6420] font-medium",
  danger: "bg-[var(--status-danger-soft)] text-[#8f3f3f] font-medium",
} as const;

interface VehicleExpiryTagProps {
  tag: VehicleExpiryTagData;
}

export function VehicleExpiryTag({ tag }: VehicleExpiryTagProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] leading-tight ${tagStyles[tag.urgency]}`}
    >
      <span>
        {tag.label} · {formatVehicleDisplayDate(tag.date)}
      </span>
      <StatusDot status={tag.urgency} />
    </span>
  );
}
