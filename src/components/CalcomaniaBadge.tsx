import {
  formatEngomadoLabel,
  getEngomadoColors,
  getEngomadoFromPlate,
  usesEngomadoByPlate,
} from "@/lib/no-circula";

interface CalcomaniaBadgeProps {
  plate: string;
  state: string;
  className?: string;
}

export function CalcomaniaBadge({ plate, state, className = "" }: CalcomaniaBadgeProps) {
  if (!usesEngomadoByPlate(state)) return null;

  const engomado = getEngomadoFromPlate(plate);
  if (!engomado) return null;

  const colors = getEngomadoColors(engomado);
  const label = formatEngomadoLabel(engomado, plate);

  return (
    <span
      className={`inline-block h-3 w-[18px] shrink-0 rounded-[3px] ${className}`}
      style={{
        backgroundColor: colors.background,
        boxShadow: `inset 0 0 0 1px ${colors.border}`,
      }}
      title={label}
      aria-label={label}
    />
  );
}
