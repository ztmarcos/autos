"use client";

import { useEffect, useState } from "react";
import type { DocumentType, MxVehicleRule, StateNewsAlert, Vehicle, VehicleDocument, VehicleEvent } from "@/lib/types";
import {
  getUpcomingItems,
  getVehicleDisplayName,
  listVehicleEvents,
  formatVehicleDisplayDate,
} from "@/lib/vehicles";
import { formatDaysLabel, getRuleSummary, getUrgencyLabel, getUrgencyStatus } from "@/lib/mx-rules";
import { getNoCirculaInfo, getActiveContingencyAlerts } from "@/lib/no-circula";
import { alertAppliesToVehicle, getVehicleNewsItems } from "@/lib/vehicle-news";
import { CalcomaniaBadge } from "@/components/CalcomaniaBadge";
import { StatusDot } from "@/components/StatusDot";
import { VehicleBrandLogo } from "@/components/VehicleBrandLogo";
import { VehicleDataTabs } from "@/components/VehicleDataTabs";
import { VehicleNewsSection } from "@/components/VehicleNewsSection";

interface VehicleDetailProps {
  userId: string;
  vehicle: Vehicle;
  rules: MxVehicleRule[];
  documents: VehicleDocument[];
  stateNewsAlerts: StateNewsAlert[];
  stateNewsUpdatedAt?: string;
  insuranceExpiry?: string;
  onBack: () => void;
  onUpdateVehicle: (patch: Partial<Vehicle>) => Promise<void>;
  onUpsertDocument: (
    docId: string | undefined,
    type: DocumentType,
    displayName: string,
    fields: Record<string, string | number | null>,
  ) => Promise<void>;
  onDeleteVehicle?: () => Promise<void>;
  onSelectDocument: (doc: VehicleDocument) => void;
}

const rowStyles = {
  ok: "",
  warning: "text-[#8a6420] font-medium",
  danger: "text-[#8f3f3f] font-medium",
} as const;

function formatDate(dateStr: string): string {
  return formatVehicleDisplayDate(dateStr) || dateStr;
}

export function VehicleDetail({
  userId,
  vehicle,
  rules,
  documents,
  stateNewsAlerts,
  stateNewsUpdatedAt,
  insuranceExpiry,
  onBack,
  onUpdateVehicle,
  onUpsertDocument,
  onDeleteVehicle,
  onSelectDocument,
}: VehicleDetailProps) {
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const upcoming = getUpcomingItems(vehicle, insuranceExpiry);
  const ruleInfo = getRuleSummary(vehicle.plate, vehicle.state, rules);
  const vehicleAlerts = stateNewsAlerts.filter((alert) =>
    alertAppliesToVehicle(alert, vehicle),
  );
  const stateAlerts = stateNewsAlerts.filter((alert) =>
    alert.stateCodes.includes(vehicle.state),
  );
  const contingencyAlerts = getActiveContingencyAlerts(stateAlerts, vehicle.state);
  const noCircula = getNoCirculaInfo(vehicle.plate, vehicle.state, {
    calcomania: vehicle.calcomania,
    vehicleType: vehicle.vehicleType,
    alias: vehicle.alias,
    brand: vehicle.brand,
    hasContingency: contingencyAlerts.length > 0,
    contingencyAlert: contingencyAlerts[0],
  });
  const newsItems = getVehicleNewsItems(vehicle, vehicleAlerts, noCircula);

  useEffect(() => {
    listVehicleEvents(vehicle.id).then(setEvents);
  }, [vehicle.id]);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white">
      <div className="border-b border-black/10 px-4 py-3">
        <button type="button" onClick={onBack} className="link-back">
          ← Volver
        </button>
        <div className="mt-3 flex items-center gap-3">
          <VehicleBrandLogo vehicle={vehicle} size="md" />
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {getVehicleDisplayName(vehicle)}
              <CalcomaniaBadge
                plate={vehicle.plate}
                state={vehicle.state}
                className="h-3.5 w-5"
              />
            </h2>
            <p className="text-[13px] text-black/50">
              {vehicle.plate} · {vehicle.state}
              {vehicle.modelYear ? ` · ${vehicle.modelYear}` : ""}
              {vehicle.brand ? ` · ${vehicle.brand}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4 py-4">
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
            Próximos
          </p>
          <dl className="divide-y divide-black/10">
            {upcoming.length === 0 ? (
              <p className="py-2 text-[15px] text-black/50">Todo al día</p>
            ) : (
              upcoming.map((item) => {
                const urgency = getUrgencyStatus(item.daysUntil);
                const statusLabel = getUrgencyLabel(item.daysUntil);
                const daysLabel = item.overdue
                  ? statusLabel
                  : urgency === "warning"
                    ? statusLabel
                    : formatDaysLabel(item.daysUntil);

                return (
                  <div key={item.type} className="flex items-center justify-between gap-3 py-3">
                    <dt className={`text-[15px] ${rowStyles[urgency]}`}>{item.label}</dt>
                    <dd className="flex items-center gap-2 text-right text-[15px]">
                      <span className="text-black/50">{formatDate(item.date)}</span>
                      <span className={rowStyles[urgency]}>{daysLabel}</span>
                      <StatusDot status={urgency} />
                    </dd>
                  </div>
                );
              })
            )}
          </dl>
        </section>

        <VehicleDataTabs
          userId={userId}
          vehicle={vehicle}
          documents={documents}
          events={events}
          onUpdateVehicle={onUpdateVehicle}
          onUpsertDocument={onUpsertDocument}
          onEventsChange={setEvents}
          onDeleteVehicle={onDeleteVehicle}
          onOpenDocument={onSelectDocument}
          onSelectDocument={(documentId) => {
            const doc = documents.find((item) => item.id === documentId);
            if (doc) onSelectDocument(doc);
          }}
        />

        {ruleInfo && (
          <section>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
              Reglas
            </p>
            <p className="text-[15px]">{ruleInfo.summary}</p>
            <p className="mt-1 text-[13px] text-black/50">{ruleInfo.tenenciaNote}</p>
            <a
              href={ruleInfo.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-black underline underline-offset-2"
            >
              Ver fuente oficial ↗
            </a>
          </section>
        )}

        <VehicleNewsSection items={newsItems} lastUpdated={stateNewsUpdatedAt} />
      </div>
    </div>
  );
}
