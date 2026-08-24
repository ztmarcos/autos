import {
  formatEngomadoLabel,
  getEngomadoColors,
  getEngomadoFromPlate,
  isMotoVehicle,
  usesEngomadoByPlate,
  type VehicleTypeHint,
} from "@/lib/no-circula";

interface CalcomaniaBadgeProps {
  plate: string;
  state: string;
  vehicle?: VehicleTypeHint;
  className?: string;
  showLabel?: boolean;
}

export function CalcomaniaBadge({
  plate,
  state,
  vehicle,
  className = "",
  showLabel = true,
}: CalcomaniaBadgeProps) {
  if (vehicle && isMotoVehicle(vehicle)) return null;
  if (!usesEngomadoByPlate(state)) return null;

  const engomado = getEngomadoFromPlate(plate);
  if (!engomado) return null;

  const colors = getEngomadoColors(engomado);
  const label = formatEngomadoLabel(engomado, plate);

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={label}
      aria-label={label}
    >
      <span
        className="inline-block h-2.5 w-4 shrink-0 rounded-full"
        style={{
          backgroundColor: colors.background,
          boxShadow: `inset 0 0 0 1px ${colors.border}`,
        }}
      />
      {showLabel ? (
        <span className="text-[11px] font-medium text-black/45">{colors.label}</span>
      ) : null}
    </span>
  );
}
