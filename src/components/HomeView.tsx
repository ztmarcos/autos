"use client";

import type { Vehicle } from "@/lib/types";
import {
  getVehicleDisplayName,
  getVehicleMetaLine,
} from "@/lib/vehicles";
import { CalcomaniaBadge } from "@/components/CalcomaniaBadge";
import { VehicleBrandLogo } from "@/components/VehicleBrandLogo";
import { VehicleExpiryTags } from "@/components/VehicleExpiryTags";
import { APP_NAME } from "@/config/app";
import { AppLogo } from "@/components/AppLogo";

interface HomeViewProps {
  vehicles: Vehicle[];
  insuranceExpiries?: Record<string, string>;
  onSelect: (vehicle: Vehicle) => void;
  onAdd: () => void;
}

const ONBOARDING_STEPS = [
  {
    step: "1",
    title: "Registra tu auto",
    body: "Placa, estado y fechas importantes en un solo lugar.",
  },
  {
    step: "2",
    title: "Escanea tu tarjeta",
    body: "Sube la tarjeta de circulación y llenamos placa, marca y estado por ti.",
  },
  {
    step: "3",
    title: "Recibe recordatorios",
    body: "Te avisamos antes de verificación, tenencia y servicio.",
  },
] as const;

const STEP_BADGE_CLASS = ["step-badge-1", "step-badge-2", "step-badge-3"] as const;

export function HomeView({
  vehicles,
  insuranceExpiries = {},
  onSelect,
  onAdd,
}: HomeViewProps) {
  if (vehicles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex items-center justify-center">
            <AppLogo size="lg" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            Bienvenido a {APP_NAME}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-black/55">
            Aún no tienes autos registrados. Empieza agregando el primero y te
            guiamos paso a paso.
          </p>

          <ol className="mt-8 space-y-4 text-left">
            {ONBOARDING_STEPS.map(({ step, title, body }, index) => (
              <li key={step} className="flex gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${STEP_BADGE_CLASS[index]}`}
                >
                  {step}
                </span>
                <div>
                  <p className="text-[15px] font-medium">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-black/50">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={onAdd}
            className="btn-primary mt-10 w-full py-3 text-[15px]"
          >
            Auto nuevo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 bg-[var(--background)] pb-24">
      <ul className="divide-y divide-[var(--border)]">
        {vehicles.map((vehicle) => (
          <li key={vehicle.id}>
            <button
              type="button"
              onClick={() => onSelect(vehicle)}
              className="flex w-full items-center gap-3 bg-[var(--surface)] px-4 py-4 text-left transition hover:bg-[var(--accent-soft)]"
            >
              <VehicleBrandLogo vehicle={vehicle} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[15px] font-medium">
                  {getVehicleDisplayName(vehicle)}
                  <CalcomaniaBadge plate={vehicle.plate} state={vehicle.state} />
                </p>
                <p className="mt-0.5 text-[13px] text-black/50">
                  {getVehicleMetaLine(vehicle)}
                </p>
                <VehicleExpiryTags
                  vehicle={vehicle}
                  insuranceExpiry={insuranceExpiries[vehicle.id]}
                />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-white shadow-lg shadow-black/10"
        aria-label="Agregar vehículo"
      >
        +
      </button>
    </div>
  );
}
