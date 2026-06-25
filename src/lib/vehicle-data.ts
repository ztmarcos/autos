import { getSchema } from "@/config/document-schemas";
import { getStateName } from "@/lib/mx-rules";
import { formatCalcomaniaLabel } from "@/lib/no-circula";
import type { DocumentType, Vehicle, VehicleDocument, VehicleEvent } from "@/lib/types";
import { formatVehicleDisplayDate } from "@/lib/vehicles";
import { parseModelYear } from "@/lib/vehicle-card-map";
import { isPhoneFieldKey } from "@/lib/documents";

export type VehicleDataTabId =
  | "general"
  | "tarjeta"
  | "poliza"
  | "servicios"
  | "tramites";

export interface DataField {
  label: string;
  value: string;
  href?: string;
}

export interface DataSection {
  title?: string;
  fields: DataField[];
  documentId?: string;
}

function formatPhoneLink(value: string | number): string | undefined {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("52")) return `+${digits}`;
  if (digits.length === 10) return `+52${digits}`;
  return `+${digits}`;
}

function pushField(
  fields: DataField[],
  label: string,
  value: string | number | null | undefined,
  key?: string,
) {
  if (value == null || value === "") return;
  const text = String(value).trim();
  if (!text) return;

  const field: DataField = { label, value: text };
  if (key && isPhoneFieldKey(key)) {
    const href = formatPhoneLink(text);
    if (href) field.href = `tel:${href}`;
  }
  fields.push(field);
}

function pushDateField(
  fields: DataField[],
  label: string,
  value: string | undefined,
) {
  if (!value?.trim()) return;
  fields.push({ label, value: formatVehicleDisplayDate(value.trim()) });
}

export function getLatestReadyDocument(
  documents: VehicleDocument[],
  type: DocumentType,
): VehicleDocument | undefined {
  return documents
    .filter((doc) => doc.detectedType === type && doc.status === "ready")
    .sort(
      (a, b) =>
        (b.processedAt ?? b.createdAt).getTime() -
        (a.processedAt ?? a.createdAt).getTime(),
    )[0];
}

export function resolveModelYear(
  vehicle: Vehicle,
  documents: VehicleDocument[] = [],
): number | undefined {
  if (vehicle.modelYear != null) return vehicle.modelYear;

  const tarjeta = getLatestReadyDocument(documents, "tarjeta_circulacion");
  const poliza = getLatestReadyDocument(documents, "poliza_seguro");
  const tarjetaFields = tarjeta?.extractedFields;
  const polizaFields = poliza?.extractedFields;

  return (
    parseModelYear(tarjetaFields?.anio ?? tarjetaFields?.modelo) ??
    parseModelYear(polizaFields?.modelo ?? polizaFields?.anio)
  );
}

function fieldsFromDocument(doc: VehicleDocument): DataField[] {
  const fields: DataField[] = [];
  const extracted = doc.extractedFields ?? {};
  const schema = doc.detectedType ? getSchema(doc.detectedType) : null;

  if (schema) {
    for (const field of schema.fields) {
      pushField(fields, field.label, extracted[field.key], field.key);
    }
    return fields;
  }

  for (const [key, value] of Object.entries(extracted)) {
    pushField(fields, key, value, key);
  }

  return fields;
}

function hasSectionContent(section: DataSection): boolean {
  return section.fields.length > 0;
}

export function getGeneralSections(
  vehicle: Vehicle,
  documents: VehicleDocument[] = [],
): DataSection[] {
  const fields: DataField[] = [];

  pushField(fields, "Alias", vehicle.alias);
  pushField(fields, "Placa", vehicle.plate);
  pushField(fields, "Estado", getStateName(vehicle.state));
  if (vehicle.calcomania) {
    pushField(fields, "Holograma", formatCalcomaniaLabel(vehicle.calcomania));
  }
  pushField(fields, "Marca", vehicle.brand);
  const modelYear = resolveModelYear(vehicle, documents);
  if (modelYear != null) {
    pushField(fields, "Modelo", modelYear);
  }
  pushField(fields, "NIV", vehicle.niv);
  pushField(fields, "Propietario", vehicle.ownerName);
  if (vehicle.cylinders != null) {
    pushField(fields, "Cilindros", vehicle.cylinders);
  }
  pushDateField(fields, "Verificación", vehicle.verificationDate);
  pushDateField(fields, "Tenencia", vehicle.tenenciaDate);
  pushDateField(fields, "Refrendo", vehicle.refrendoDate);
  if (vehicle.serviceKm != null) {
    pushField(fields, "Km servicio", `${vehicle.serviceKm.toLocaleString("es-MX")} km`);
  }
  if (vehicle.currentKm != null) {
    pushField(fields, "Km actual", `${vehicle.currentKm.toLocaleString("es-MX")} km`);
  }

  return hasSectionContent({ fields }) ? [{ fields }] : [];
}

const TARJETA_VEHICLE_LABELS: Array<{
  label: string;
  getValue: (vehicle: Vehicle) => string | number | undefined;
}> = [
  { label: "Placa", getValue: (vehicle) => vehicle.plate },
  { label: "Propietario", getValue: (vehicle) => vehicle.ownerName },
  { label: "NIV", getValue: (vehicle) => vehicle.niv },
  {
    label: "Cilindros",
    getValue: (vehicle) => vehicle.cylinders,
  },
  { label: "Expedición", getValue: (vehicle) => vehicle.cardIssueDate },
  { label: "Vencimiento", getValue: (vehicle) => vehicle.cardExpiryDate },
];

export function getTarjetaSections(
  vehicle: Vehicle,
  documents: VehicleDocument[],
): DataSection[] {
  const doc = getLatestReadyDocument(documents, "tarjeta_circulacion");
  const sections: DataSection[] = [];

  if (doc) {
    sections.push({
      title: doc.displayName?.trim() || "Tarjeta escaneada",
      fields: fieldsFromDocument(doc),
      documentId: doc.id,
    });
  }

  const supplement: DataField[] = [];
  const existingLabels = new Set(
    sections.flatMap((section) => section.fields.map((field) => field.label)),
  );

  for (const { label, getValue } of TARJETA_VEHICLE_LABELS) {
    if (existingLabels.has(label)) continue;
    const value = getValue(vehicle);
    if (value == null || value === "") continue;
    if (label === "Expedición" || label === "Vencimiento") {
      pushDateField(supplement, label, String(value));
      continue;
    }
    pushField(supplement, label, value);
  }

  if (supplement.length > 0) {
    sections.push({
      title: doc ? "Datos adicionales" : "Tarjeta de circulación",
      fields: supplement,
    });
  }

  return sections.filter(hasSectionContent);
}

export function getPolizaSections(documents: VehicleDocument[]): DataSection[] {
  const docs = documents
    .filter((doc) => doc.detectedType === "poliza_seguro" && doc.status === "ready")
    .sort(
      (a, b) =>
        (b.processedAt ?? b.createdAt).getTime() -
        (a.processedAt ?? a.createdAt).getTime(),
    );

  return docs
    .map((doc) => ({
      title: doc.displayName?.trim() || "Póliza de seguro",
      fields: fieldsFromDocument(doc),
      documentId: doc.id,
    }))
    .filter(hasSectionContent);
}

export function getServiciosSections(
  vehicle: Vehicle,
  documents: VehicleDocument[],
  events: VehicleEvent[],
): DataSection[] {
  const sections: DataSection[] = [];
  const scheduled: DataField[] = [];

  pushDateField(scheduled, "Servicio anterior", vehicle.lastServiceDate);
  pushDateField(scheduled, "Próximo servicio", vehicle.serviceDate);
  if (vehicle.serviceKm != null) {
    pushField(scheduled, "Km servicio", `${vehicle.serviceKm.toLocaleString("es-MX")} km`);
  }
  if (vehicle.currentKm != null) {
    pushField(scheduled, "Km actual", `${vehicle.currentKm.toLocaleString("es-MX")} km`);
  }

  if (hasSectionContent({ fields: scheduled })) {
    sections.push({ title: "Programado", fields: scheduled });
  }

  const serviceEvents = events.filter((event) => event.type === "servicio");
  if (serviceEvents.length > 0) {
    sections.push({
      title: "Historial",
      fields: serviceEvents.map((event) => {
        const details = [
          event.description,
          event.km != null ? `${event.km.toLocaleString("es-MX")} km` : null,
          event.amount != null
            ? `$${event.amount.toLocaleString("es-MX")}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          label: formatVehicleDisplayDate(event.date),
          value: details || "Servicio registrado",
        };
      }),
    });
  }

  const serviceDocs = documents
    .filter((doc) => doc.detectedType === "servicio" && doc.status === "ready")
    .sort(
      (a, b) =>
        (b.processedAt ?? b.createdAt).getTime() -
        (a.processedAt ?? a.createdAt).getTime(),
    );

  for (const doc of serviceDocs) {
    const fields = fieldsFromDocument(doc);
    if (fields.length === 0) continue;
    sections.push({
      title: doc.displayName?.trim() || "Servicio escaneado",
      fields,
      documentId: doc.id,
    });
  }

  return sections;
}

export function getTramitesSections(
  documents: VehicleDocument[],
  events: VehicleEvent[] = [],
): DataSection[] {
  const types: Array<{ type: DocumentType; fallback: string }> = [
    { type: "verificacion", fallback: "Verificación" },
    { type: "tenencia", fallback: "Tenencia" },
    { type: "factura", fallback: "Factura" },
  ];

  const sections: DataSection[] = [];

  for (const { type, fallback } of types) {
    const docs = documents
      .filter((doc) => doc.detectedType === type && doc.status === "ready")
      .sort(
        (a, b) =>
          (b.processedAt ?? b.createdAt).getTime() -
          (a.processedAt ?? a.createdAt).getTime(),
      );

    for (const doc of docs) {
      const fields = fieldsFromDocument(doc);
      if (fields.length === 0) continue;
      sections.push({
        title: doc.displayName?.trim() || fallback,
        fields,
        documentId: doc.id,
      });
    }
  }

  const tramiteEvents = events.filter((event) => event.type !== "servicio");
  if (tramiteEvents.length > 0) {
    sections.push({
      title: "Historial",
      fields: tramiteEvents.map((event) => {
        const label =
          event.type === "verificacion"
            ? "Verificación"
            : event.type === "tenencia"
              ? "Tenencia"
              : event.type === "refrendo"
                ? "Refrendo"
                : event.type === "seguro"
                ? "Seguro"
                : "Evento";

        const details = [
          event.description,
          event.amount != null
            ? `$${event.amount.toLocaleString("es-MX")}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          label: `${label} · ${formatVehicleDisplayDate(event.date)}`,
          value: details || "Registrado",
        };
      }),
    });
  }

  return sections;
}

export function tabHasContent(
  tab: VehicleDataTabId,
  vehicle: Vehicle,
  documents: VehicleDocument[],
  events: VehicleEvent[],
): boolean {
  switch (tab) {
    case "general":
      return getGeneralSections(vehicle, documents).length > 0;
    case "tarjeta":
      return getTarjetaSections(vehicle, documents).length > 0;
    case "poliza":
      return getPolizaSections(documents).length > 0;
    case "servicios":
      return getServiciosSections(vehicle, documents, events).length > 0;
    case "tramites":
      return getTramitesSections(documents, events).length > 0;
  }
}
