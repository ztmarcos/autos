import type { UrgencyStatus } from "@/lib/types";

interface StatusDotProps {
  status: UrgencyStatus;
  className?: string;
}

const colors: Record<UrgencyStatus, string> = {
  ok: "status-ok",
  warning: "status-warning",
  danger: "status-danger",
};

export function StatusDot({ status, className = "" }: StatusDotProps) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full opacity-90 ${colors[status]} ${className}`}
      aria-hidden
    />
  );
}
