"use client";

import { useMemo, useState } from "react";
import type { Calcomania, DocumentType, Vehicle, VehicleDocument, VehicleEvent, VehicleType } from "@/lib/types";
import { CALCOMANIA_OPTIONS, VEHICLE_TYPE_OPTIONS } from "@/lib/types";
import { getSchema } from "@/config/document-schemas";
import { MX_STATES, getStateName } from "@/lib/mx-rules";
import { formatCalcomaniaLabel } from "@/lib/no-circula";
import {
  getLatestReadyDocument,
  getServiciosSections,
  getTramitesSections,
  type DataField,
  type DataSection,
  type VehicleDataTabId,
} from "@/lib/vehicle-data";
import { addVehicleEvent, listVehicleEvents, formatVehicleDisplayDate } from "@/lib/vehicles";
import { parseVehicleDateLiteral } from "@/lib/dates";
import { ClickToEditField, ClickToEditSelectField } from "@/components/ClickToEditField";
import { DocumentGrid } from "@/components/DocumentGrid";

interface VehicleDataTabsProps {
  userId: string;
  vehicle: Vehicle;
  documents: VehicleDocument[];
  events: VehicleEvent[];
  onUpdateVehicle: (patch: Partial<Vehicle>) => Promise<void>;
  onUpsertDocument: (
    docId: string | undefined,
    type: DocumentType,
    displayName: string,
    fields: Record<string, string | number | null>,
  ) => Promise<void>;
  onEventsChange?: (events: VehicleEvent[]) => void;
  onDeleteVehicle?: () => Promise<void>;
  onSelectDocument?: (documentId: string) => void;
  onSelectDocumentFile?: (doc: VehicleDocument) => void;
  onOpenDocument?: (doc: VehicleDocument) => void;
}

const TABS: Array<{ id: VehicleDataTabId; label: string }> = [
  { id: "general", label: "General" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "poliza", label: "Póliza" },
  { id: "servicios", label: "Servicios" },
  { id: "tramites", label: "Trámites y docs" },
];

function useFieldEditor() {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(key: string, action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
      setEditingKey(null);
    } finally {
      setSaving(false);
    }
  }

  return {
    editingKey,
    saving,
    start: (key: string) => setEditingKey(key),
    cancel: () => setEditingKey(null),
    save,
    isEditing: (key: string) => editingKey === key,
  };
}

function DataFieldList({ fields }: { fields: DataField[] }) {
  return (
    <dl className="divide-y divide-black/10 text-[15px]">
      {fields.map((field, index) => (
        <div key={`${field.label}-${index}`} className="flex justify-between gap-3 py-2.5">
          <dt className="text-black/50">{field.label}</dt>
          <dd className="min-w-0 text-right">
            {field.href ? (
              <a href={field.href} className="font-medium underline underline-offset-2">
                {field.value}
              </a>
            ) : (
              <span className={field.label === "NIV" ? "font-mono text-[13px]" : ""}>
                {field.value}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DataSections({
  sections,
  emptyMessage,
  onSelectDocument,
}: {
  sections: DataSection[];
  emptyMessage: string;
  onSelectDocument?: (documentId: string) => void;
}) {
  if (sections.length === 0) {
    return <p className="py-2 text-[15px] text-black/50">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-5">
      {sections.map((section, index) => (
        <div key={`${section.title ?? "section"}-${index}`}>
          {section.title ? (
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-black/40">
                {section.title}
              </p>
              {section.documentId && onSelectDocument ? (
                <button
                  type="button"
                  onClick={() => onSelectDocument(section.documentId!)}
                  className="shrink-0 text-[12px] text-black underline underline-offset-2"
                >
                  Ver documento
                </button>
              ) : null}
            </div>
          ) : null}
          <DataFieldList fields={section.fields} />
        </div>
      ))}
    </div>
  );
}

const TARJETA_VEHICLE_KEYS: Record<string, keyof Vehicle> = {
  placa: "plate",
  niv: "niv",
  nombre: "ownerName",
  cilindros: "cylinders",
  fecha_expedicion: "cardIssueDate",
  fecha_vencimiento: "cardExpiryDate",
  marca: "brand",
};

function getTarjetaFieldValue(
  key: string,
  vehicle: Vehicle,
  doc?: VehicleDocument,
): string {
  const fromDoc = doc?.extractedFields?.[key];
  if (fromDoc != null && String(fromDoc).trim()) return String(fromDoc).trim();

  const vehicleKey = TARJETA_VEHICLE_KEYS[key];
  if (vehicleKey) {
    const value = vehicle[vehicleKey];
    if (value != null && value !== "") return String(value);
  }
  if (key === "anio" && vehicle.modelYear != null) return String(vehicle.modelYear);
  return "";
}

function buildTarjetaVehiclePatch(
  key: string,
  raw: string,
): Partial<Vehicle> | null {
  const value = raw.trim();
  if (key === "anio") {
    const year = parseInt(value, 10);
    return { modelYear: Number.isFinite(year) ? year : undefined };
  }
  const vehicleKey = TARJETA_VEHICLE_KEYS[key];
  if (!vehicleKey) return null;
  if (vehicleKey === "cylinders") {
    const n = parseInt(value, 10);
    return { cylinders: Number.isFinite(n) ? n : undefined };
  }
  if (vehicleKey === "plate") return { plate: value.toUpperCase() || undefined };
  if (vehicleKey === "niv") return { niv: value.toUpperCase() || undefined };
  return { [vehicleKey]: value || undefined } as Partial<Vehicle>;
}

function GeneralTab({
  vehicle,
  onUpdateVehicle,
  onDeleteVehicle,
}: {
  vehicle: Vehicle;
  onUpdateVehicle: (patch: Partial<Vehicle>) => Promise<void>;
  onDeleteVehicle?: () => Promise<void>;
}) {
  const editor = useFieldEditor();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const v = vehicle;

  return (
    <div>
      <p className="mb-3 text-[13px] text-black/45">
        Toca un dato para editarlo. Confirma con Guardar.
      </p>

      <ClickToEditField
        label="Alias"
        value={v.alias ?? ""}
        placeholder="Ejemplo: Jetta"
        editing={editor.isEditing("alias")}
        saving={editor.saving}
        onStartEdit={() => editor.start("alias")}
        onCancel={editor.cancel}
        onSave={(val) => editor.save("alias", () => onUpdateVehicle({ alias: val.trim() || undefined }))}
      />
      <ClickToEditField
        label="Marca"
        value={v.brand ?? ""}
        editing={editor.isEditing("brand")}
        saving={editor.saving}
        onStartEdit={() => editor.start("brand")}
        onCancel={editor.cancel}
        onSave={(val) => editor.save("brand", () => onUpdateVehicle({ brand: val.trim() || undefined }))}
      />
      <ClickToEditField
        label="Modelo (año)"
        value={v.modelYear?.toString() ?? ""}
        inputType="number"
        editing={editor.isEditing("modelYear")}
        saving={editor.saving}
        onStartEdit={() => editor.start("modelYear")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("modelYear", () =>
            onUpdateVehicle({
              modelYear: val ? parseInt(val, 10) || undefined : undefined,
            }),
          )
        }
      />
      <ClickToEditField
        label="Placa"
        value={v.plate ?? ""}
        editing={editor.isEditing("plate")}
        saving={editor.saving}
        onStartEdit={() => editor.start("plate")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("plate", () =>
            onUpdateVehicle({ plate: val.trim().toUpperCase() || undefined }),
          )
        }
      />
      <ClickToEditSelectField
        label="Estado"
        value={v.state}
        displayValue={getStateName(v.state)}
        editing={editor.isEditing("state")}
        saving={editor.saving}
        onStartEdit={() => editor.start("state")}
        onCancel={editor.cancel}
        onSave={(val) => editor.save("state", () => onUpdateVehicle({ state: val }))}
      >
        {MX_STATES.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name}
          </option>
        ))}
      </ClickToEditSelectField>
      <ClickToEditSelectField
        label="Tipo"
        value={v.vehicleType ?? "auto"}
        displayValue={
          VEHICLE_TYPE_OPTIONS.find((option) => option.value === (v.vehicleType ?? "auto"))
            ?.label ?? "Automóvil"
        }
        editing={editor.isEditing("vehicleType")}
        saving={editor.saving}
        onStartEdit={() => editor.start("vehicleType")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("vehicleType", () =>
            onUpdateVehicle({ vehicleType: (val as VehicleType) || "auto" }),
          )
        }
      >
        {VEHICLE_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </ClickToEditSelectField>
      <ClickToEditSelectField
        label="Holograma"
        value={v.calcomania ?? ""}
        displayValue={v.calcomania ? formatCalcomaniaLabel(v.calcomania) : ""}
        editing={editor.isEditing("calcomania")}
        saving={editor.saving}
        onStartEdit={() => editor.start("calcomania")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("calcomania", () =>
            onUpdateVehicle({ calcomania: (val as Calcomania) || undefined }),
          )
        }
      >
        <option value="">Sin especificar</option>
        {CALCOMANIA_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </ClickToEditSelectField>
      <ClickToEditField
        label="NIV"
        value={v.niv ?? ""}
        mono
        editing={editor.isEditing("niv")}
        saving={editor.saving}
        onStartEdit={() => editor.start("niv")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("niv", () =>
            onUpdateVehicle({ niv: val.trim().toUpperCase() || undefined }),
          )
        }
      />
      <ClickToEditField
        label="Propietario"
        value={v.ownerName ?? ""}
        editing={editor.isEditing("ownerName")}
        saving={editor.saving}
        onStartEdit={() => editor.start("ownerName")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("ownerName", () => onUpdateVehicle({ ownerName: val.trim() || undefined }))
        }
      />
      <ClickToEditField
        label="Cilindros"
        value={v.cylinders?.toString() ?? ""}
        inputType="number"
        editing={editor.isEditing("cylinders")}
        saving={editor.saving}
        onStartEdit={() => editor.start("cylinders")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("cylinders", () =>
            onUpdateVehicle({
              cylinders: val ? parseInt(val, 10) || undefined : undefined,
            }),
          )
        }
      />
      <ClickToEditField
        label="Expedición tarjeta"
        value={v.cardIssueDate ?? ""}
        editing={editor.isEditing("cardIssueDate")}
        saving={editor.saving}
        onStartEdit={() => editor.start("cardIssueDate")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("cardIssueDate", () => onUpdateVehicle({ cardIssueDate: val || undefined }))
        }
      />
      <ClickToEditField
        label="Vencimiento tarjeta"
        value={v.cardExpiryDate ?? ""}
        editing={editor.isEditing("cardExpiryDate")}
        saving={editor.saving}
        onStartEdit={() => editor.start("cardExpiryDate")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("cardExpiryDate", () => onUpdateVehicle({ cardExpiryDate: val || undefined }))
        }
      />
      <ClickToEditField
        label="Verificación"
        value={v.verificationDate ?? ""}
        inputType="date"
        editing={editor.isEditing("verificationDate")}
        saving={editor.saving}
        onStartEdit={() => editor.start("verificationDate")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("verificationDate", () =>
            onUpdateVehicle({ verificationDate: val || undefined }),
          )
        }
      />
      <ClickToEditField
        label="Tenencia"
        value={v.tenenciaDate ?? ""}
        inputType="date"
        editing={editor.isEditing("tenenciaDate")}
        saving={editor.saving}
        onStartEdit={() => editor.start("tenenciaDate")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("tenenciaDate", () => onUpdateVehicle({ tenenciaDate: val || undefined }))
        }
      />
      <ClickToEditField
        label="Refrendo"
        value={v.refrendoDate ?? ""}
        inputType="date"
        editing={editor.isEditing("refrendoDate")}
        saving={editor.saving}
        onStartEdit={() => editor.start("refrendoDate")}
        onCancel={editor.cancel}
        onSave={(val) =>
          editor.save("refrendoDate", () => onUpdateVehicle({ refrendoDate: val || undefined }))
        }
      />

      {onDeleteVehicle && (
        <div className="pt-4">
          {confirmDelete ? (
            <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
              <p className="text-sm text-black/70">
                ¿Eliminar este vehículo y todos sus documentos?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 rounded-lg border border-black/15 py-2 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await onDeleteVehicle();
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  className="flex-1 rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
                >
                  {deleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-black/60 underline underline-offset-2"
            >
              Eliminar vehículo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentFieldsTab({
  userId,
  type,
  vehicle,
  documents,
  onUpdateVehicle,
  onUpsertDocument,
  onOpenDocument,
}: {
  userId: string;
  type: "tarjeta_circulacion" | "poliza_seguro";
  vehicle: Vehicle;
  documents: VehicleDocument[];
  onUpdateVehicle: (patch: Partial<Vehicle>) => Promise<void>;
  onUpsertDocument: VehicleDataTabsProps["onUpsertDocument"];
  onOpenDocument?: (doc: VehicleDocument) => void;
}) {
  const editor = useFieldEditor();
  const schema = getSchema(type);
  const doc = getLatestReadyDocument(documents, type);
  const displayName = schema.label;

  const getValue = (key: string) => {
    if (type === "tarjeta_circulacion") return getTarjetaFieldValue(key, vehicle, doc);
    const fromDoc = doc?.extractedFields?.[key];
    if (fromDoc != null && String(fromDoc).trim()) return String(fromDoc).trim();
    if (key === "vigencia_fin" && vehicle.insuranceExpiryDate) {
      return vehicle.insuranceExpiryDate;
    }
    return "";
  };

  async function saveField(key: string, raw: string) {
    const fields: Record<string, string | number | null> = {
      ...(doc?.extractedFields ?? {}),
      [key]: raw.trim() || null,
    };
    await onUpsertDocument(doc?.id, type, displayName, fields);

    if (type === "tarjeta_circulacion") {
      const patch = buildTarjetaVehiclePatch(key, raw);
      if (patch) await onUpdateVehicle(patch);
    }
    if (type === "poliza_seguro" && key === "vigencia_fin" && raw.trim()) {
      const normalized = parseVehicleDateLiteral(raw) ?? raw.trim();
      await onUpdateVehicle({ insuranceExpiryDate: normalized });
    }
  }

  return (
    <div>
      {onOpenDocument && (
        <DocumentGrid
          userId={userId}
          vehicleId={vehicle.id}
          documents={documents}
          types={[type]}
          hintType={type}
          title={type === "tarjeta_circulacion" ? "Tarjetas" : "Pólizas"}
          onSelect={onOpenDocument}
        />
      )}

      <p className="mb-3 text-[13px] text-black/45">
        Toca un dato para editarlo. Confirma con Guardar.
        {!doc && " También puedes capturar datos manualmente."}
      </p>

      {schema.fields.map((field) => (
        <ClickToEditField
          key={field.key}
          label={field.label}
          value={getValue(field.key)}
          mono={field.key === "niv" || field.key === "placa"}
          editing={editor.isEditing(field.key)}
          saving={editor.saving}
          onStartEdit={() => editor.start(field.key)}
          onCancel={editor.cancel}
          onSave={(val) => editor.save(field.key, () => saveField(field.key, val))}
        />
      ))}
    </div>
  );
}

function ServiciosTab({
  userId,
  vehicle,
  documents,
  events,
  onUpdateVehicle,
  onEventsChange,
  onOpenDocument,
  onSelectDocument,
}: {
  userId: string;
  vehicle: Vehicle;
  documents: VehicleDocument[];
  events: VehicleEvent[];
  onUpdateVehicle: (patch: Partial<Vehicle>) => Promise<void>;
  onEventsChange?: (events: VehicleEvent[]) => void;
  onOpenDocument?: (doc: VehicleDocument) => void;
  onSelectDocument?: (documentId: string) => void;
}) {
  const editor = useFieldEditor();
  const [logDate, setLogDate] = useState("");
  const [logKm, setLogKm] = useState("");
  const [logDescription, setLogDescription] = useState("");
  const [logging, setLogging] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);

  const scannedSections = useMemo(
    () =>
      getServiciosSections(vehicle, documents, events).filter(
        (section) => section.title !== "Programado" && section.title !== "Historial",
      ),
    [vehicle, documents, events],
  );

  const history = events.filter((event) => event.type === "servicio");

  async function handleLogService() {
    if (!logDate) return;
    setLogging(true);
    try {
      await addVehicleEvent(vehicle.id, {
        type: "servicio",
        date: logDate,
        km: logKm ? parseInt(logKm, 10) : undefined,
        description: logDescription.trim() || undefined,
      });
      const refreshed = await listVehicleEvents(vehicle.id);
      onEventsChange?.(refreshed);
      setLogDate("");
      setLogKm("");
      setLogDescription("");
      setShowLogForm(false);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-6">
      {onOpenDocument && (
        <DocumentGrid
          userId={userId}
          vehicleId={vehicle.id}
          documents={documents}
          types={["servicio"]}
          hintType="servicio"
          title="Facturas o detalles del servicio"
          uploadLabel="Subir facturas o detalles"
          onSelect={onOpenDocument}
        />
      )}

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
          Servicio anterior
        </p>
        <ClickToEditField
          label="Fecha"
          value={vehicle.lastServiceDate ?? ""}
          inputType="date"
          editing={editor.isEditing("lastServiceDate")}
          saving={editor.saving}
          onStartEdit={() => editor.start("lastServiceDate")}
          onCancel={editor.cancel}
          onSave={(val) =>
            editor.save("lastServiceDate", () =>
              onUpdateVehicle({ lastServiceDate: val || undefined }),
            )
          }
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
          Próximo servicio
        </p>
        <ClickToEditField
          label="Fecha"
          value={vehicle.serviceDate ?? ""}
          inputType="date"
          editing={editor.isEditing("serviceDate")}
          saving={editor.saving}
          onStartEdit={() => editor.start("serviceDate")}
          onCancel={editor.cancel}
          onSave={(val) =>
            editor.save("serviceDate", () => onUpdateVehicle({ serviceDate: val || undefined }))
          }
        />
        <ClickToEditField
          label="Km objetivo"
          value={vehicle.serviceKm?.toString() ?? ""}
          inputType="number"
          editing={editor.isEditing("serviceKm")}
          saving={editor.saving}
          onStartEdit={() => editor.start("serviceKm")}
          onCancel={editor.cancel}
          onSave={(val) =>
            editor.save("serviceKm", () =>
              onUpdateVehicle({
                serviceKm: val ? parseInt(val, 10) || undefined : undefined,
              }),
            )
          }
        />
        <ClickToEditField
          label="Km actual"
          value={vehicle.currentKm?.toString() ?? ""}
          inputType="number"
          editing={editor.isEditing("currentKm")}
          saving={editor.saving}
          onStartEdit={() => editor.start("currentKm")}
          onCancel={editor.cancel}
          onSave={(val) =>
            editor.save("currentKm", () =>
              onUpdateVehicle({
                currentKm: val ? parseInt(val, 10) || undefined : undefined,
              }),
            )
          }
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-black/40">
          Historial
        </p>
        {!showLogForm ? (
          <button
            type="button"
            onClick={() => setShowLogForm(true)}
            className="text-sm text-black underline underline-offset-2"
          >
            + Registrar servicio hecho
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-black/10 p-3">
            <label className="block text-[13px] text-black/50">
              Fecha
              <input
                type="date"
                className="field-input mt-1 w-full"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
              />
            </label>
            <label className="block text-[13px] text-black/50">
              Km (opcional)
              <input
                type="number"
                className="field-input mt-1 w-full"
                value={logKm}
                onChange={(e) => setLogKm(e.target.value)}
              />
            </label>
            <label className="block text-[13px] text-black/50">
              Notas
              <input
                className="field-input mt-1 w-full"
                value={logDescription}
                onChange={(e) => setLogDescription(e.target.value)}
                placeholder="Ejemplo: Cambio de aceite"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="flex-1 rounded-lg border border-black/15 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!logDate || logging}
                onClick={() => void handleLogService()}
                className="flex-1 rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
              >
                {logging ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-4">
            <DataFieldList
              fields={history.map((event) => ({
                label: formatVehicleDisplayDate(event.date),
                value:
                  [event.description, event.km != null ? `${event.km.toLocaleString("es-MX")} km` : null]
                    .filter(Boolean)
                    .join(" · ") || "Servicio registrado",
              }))}
            />
          </div>
        )}
      </div>

      {scannedSections.length > 0 && (
        <DataSections
          sections={scannedSections}
          emptyMessage=""
          onSelectDocument={onSelectDocument}
        />
      )}
    </div>
  );
}

export function VehicleDataTabs({
  userId,
  vehicle,
  documents,
  events,
  onUpdateVehicle,
  onUpsertDocument,
  onEventsChange,
  onDeleteVehicle,
  onSelectDocument,
  onOpenDocument,
}: VehicleDataTabsProps) {
  const [activeTab, setActiveTab] = useState<VehicleDataTabId>("general");

  const tramitesDocTypes = useMemo(
    (): DocumentType[] => ["verificacion", "tenencia", "factura", "otro"],
    [],
  );

  const tramitesSections = useMemo(
    () => getTramitesSections(documents, events),
    [documents, events],
  );

  return (
    <section>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-black/40">
        Datos del auto
      </p>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition ${
                isActive
                  ? "bg-black text-white"
                  : "border border-black/15 text-black hover:bg-black/[0.03]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "general" && (
        <GeneralTab
          vehicle={vehicle}
          onUpdateVehicle={onUpdateVehicle}
          onDeleteVehicle={onDeleteVehicle}
        />
      )}

      {activeTab === "tarjeta" && (
        <DocumentFieldsTab
          userId={userId}
          type="tarjeta_circulacion"
          vehicle={vehicle}
          documents={documents}
          onUpdateVehicle={onUpdateVehicle}
          onUpsertDocument={onUpsertDocument}
          onOpenDocument={onOpenDocument}
        />
      )}

      {activeTab === "poliza" && (
        <DocumentFieldsTab
          userId={userId}
          type="poliza_seguro"
          vehicle={vehicle}
          documents={documents}
          onUpdateVehicle={onUpdateVehicle}
          onUpsertDocument={onUpsertDocument}
          onOpenDocument={onOpenDocument}
        />
      )}

      {activeTab === "servicios" && (
        <ServiciosTab
          userId={userId}
          vehicle={vehicle}
          documents={documents}
          events={events}
          onUpdateVehicle={onUpdateVehicle}
          onEventsChange={onEventsChange}
          onOpenDocument={onOpenDocument}
          onSelectDocument={onSelectDocument}
        />
      )}

      {activeTab === "tramites" && (
        <>
          {onOpenDocument && (
            <DocumentGrid
              userId={userId}
              vehicleId={vehicle.id}
              documents={documents}
              types={tramitesDocTypes}
              title="Comprobantes"
              onSelect={onOpenDocument}
            />
          )}
          <DataSections
            sections={tramitesSections}
            emptyMessage="Sube comprobantes de verificación, tenencia o facturas para ver los datos extraídos."
            onSelectDocument={onSelectDocument}
          />
        </>
      )}
    </section>
  );
}
