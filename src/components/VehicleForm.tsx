"use client";

import { useEffect, useRef, useState } from "react";
import type { Calcomania, Vehicle, VehicleType } from "@/lib/types";
import { CALCOMANIA_OPTIONS, VEHICLE_TYPE_OPTIONS } from "@/lib/types";
import { MX_STATES } from "@/lib/mx-rules";
import { isNativePlatform } from "@/lib/local-notifications";
import { scanVehicleCard } from "@/lib/scan-vehicle-card";
import type { VehicleCardFields } from "@/lib/vehicle-card-map";

interface VehicleFormProps {
  initial?: Vehicle;
  isFirstVehicle?: boolean;
  onSave: (
    data: Partial<Vehicle>,
    cardFile?: File | null,
    cardFields?: VehicleCardFields | null,
  ) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

export function VehicleForm({
  initial,
  isFirstVehicle = false,
  onSave,
  onCancel,
  onDelete,
}: VehicleFormProps) {
  const [alias, setAlias] = useState(initial?.alias ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [niv, setNiv] = useState(initial?.niv ?? "");
  const [cylinders, setCylinders] = useState(initial?.cylinders?.toString() ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [cardIssueDate, setCardIssueDate] = useState(initial?.cardIssueDate ?? "");
  const [cardExpiryDate, setCardExpiryDate] = useState(initial?.cardExpiryDate ?? "");
  const [state, setState] = useState(initial?.state ?? "CDMX");
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    initial?.vehicleType ?? "auto",
  );
  const [calcomania, setCalcomania] = useState<Calcomania | "">(
    initial?.calcomania ?? "",
  );
  const [verificationDate, setVerificationDate] = useState(initial?.verificationDate ?? "");
  const [tenenciaDate, setTenenciaDate] = useState(initial?.tenenciaDate ?? "");
  const [refrendoDate, setRefrendoDate] = useState(initial?.refrendoDate ?? "");
  const [modelYear, setModelYear] = useState(initial?.modelYear?.toString() ?? "");
  const [serviceDate, setServiceDate] = useState(initial?.serviceDate ?? "");
  const [serviceKm, setServiceKm] = useState(initial?.serviceKm?.toString() ?? "");
  const [showMore, setShowMore] = useState(false);
  const [reminderDays, setReminderDays] = useState<number[]>(
    initial?.reminderDays ?? [7, 1],
  );
  const [localNotifications, setLocalNotifications] = useState(
    initial?.localNotifications ?? true,
  );
  const [calendarSync, setCalendarSync] = useState(initial?.calendarSync ?? false);
  const [includeInEmail, setIncludeInEmail] = useState(
    initial?.includeInEmail ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [scanPreview, setScanPreview] = useState<VehicleCardFields | null>(null);
  const [scanFileName, setScanFileName] = useState<string | null>(null);
  const [cardScanFile, setCardScanFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scanSectionRef = useRef<HTMLElement>(null);
  const native = isNativePlatform();
  const isNew = !initial;

  useEffect(() => {
    if (isFirstVehicle && scanSectionRef.current) {
      scanSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isFirstVehicle]);

  useEffect(() => {
    if (!initial) return;
    setAlias(initial.alias ?? "");
    setBrand(initial.brand ?? "");
    setPlate(initial.plate ?? "");
    setNiv(initial.niv ?? "");
    setCylinders(initial.cylinders?.toString() ?? "");
    setOwnerName(initial.ownerName ?? "");
    setCardIssueDate(initial.cardIssueDate ?? "");
    setCardExpiryDate(initial.cardExpiryDate ?? "");
    setState(initial.state ?? "CDMX");
    setVehicleType(initial.vehicleType ?? "auto");
    setCalcomania(initial.calcomania ?? "");
    setVerificationDate(initial.verificationDate ?? "");
    setTenenciaDate(initial.tenenciaDate ?? "");
    setRefrendoDate(initial.refrendoDate ?? "");
    setModelYear(initial.modelYear?.toString() ?? "");
    setServiceDate(initial.serviceDate ?? "");
    setServiceKm(initial.serviceKm?.toString() ?? "");
    setReminderDays(initial.reminderDays ?? [7, 1]);
    setLocalNotifications(initial.localNotifications ?? true);
    setCalendarSync(initial.calendarSync ?? false);
    setIncludeInEmail(initial.includeInEmail ?? true);
  }, [initial]);

  function toggleReminder(day: number) {
    setReminderDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => b - a),
    );
  }

  async function handleCardFile(file: File) {
    setScanning(true);
    setScanError(null);
    setScanHint(null);
    setScanFileName(file.name);
    setCardScanFile(file);
    try {
      const result = await scanVehicleCard(file);
      setScanPreview(result.extractedFields);
      if (result.mapped.plate) setPlate(result.mapped.plate);
      if (result.mapped.alias) setAlias(result.mapped.alias);
      if (result.mapped.brand) setBrand(result.mapped.brand);
      if (result.mapped.state) setState(result.mapped.state);
      if (result.mapped.niv) setNiv(result.mapped.niv);
      if (result.mapped.cylinders) setCylinders(String(result.mapped.cylinders));
      if (result.mapped.ownerName) setOwnerName(result.mapped.ownerName);
      if (result.mapped.cardIssueDate) setCardIssueDate(result.mapped.cardIssueDate);
      if (result.mapped.cardExpiryDate) setCardExpiryDate(result.mapped.cardExpiryDate);
      if (result.mapped.modelYear) setModelYear(String(result.mapped.modelYear));
      const hasCoreData =
        result.mapped.plate ||
        result.mapped.alias ||
        result.mapped.niv ||
        result.mapped.ownerName;
      if (!hasCoreData) {
        setScanHint(
          "Lectura parcial: completa los campos abajo y guarda cuando quieras.",
        );
      }
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Error al leer la tarjeta");
      setScanPreview(null);
      setCardScanFile(null);
      setScanHint(
        "No pudimos leer la tarjeta, pero puedes guardar el auto con los datos que tengas.",
      );
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(
        {
          alias: alias.trim() || undefined,
          brand: brand.trim() || undefined,
          plate: plate.trim().toUpperCase() || undefined,
          niv: niv.trim().toUpperCase() || undefined,
          cylinders: cylinders ? parseInt(cylinders, 10) || undefined : undefined,
          ownerName: ownerName.trim() || undefined,
          cardIssueDate: cardIssueDate || undefined,
          cardExpiryDate: cardExpiryDate || undefined,
          state,
          vehicleType,
          calcomania: calcomania || undefined,
          verificationDate: verificationDate || undefined,
          tenenciaDate: tenenciaDate || undefined,
          refrendoDate: refrendoDate || undefined,
          modelYear: modelYear ? parseInt(modelYear, 10) || undefined : undefined,
          serviceDate: serviceDate || undefined,
          serviceKm: serviceKm ? parseInt(serviceKm, 10) : undefined,
          reminderDays,
          localNotifications,
          calendarSync,
          includeInEmail,
        },
        isNew ? cardScanFile : null,
        isNew ? scanPreview : null,
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "No se pudo guardar el vehículo",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto bg-white">
      <div className="border-b border-black/10 px-4 py-3">
        <button type="button" onClick={onCancel} className="link-back">
          ← Cancelar
        </button>
        <h2 className="mt-2 text-xl font-semibold">
          {initial ? "Editar vehículo" : isFirstVehicle ? "Tu primer auto" : "Agregar vehículo"}
        </h2>
        {isFirstVehicle && (
          <p className="mt-2 text-[14px] leading-relaxed text-black/55">
            Puedes capturar algunos datos de tu auto si subes la tarjeta de
            circulación. Sube una foto o PDF y llenaremos placa, marca y estado
            por ti.
          </p>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        {isNew && (
          <section
            ref={scanSectionRef}
            className={`rounded-xl border p-4 ${
              isFirstVehicle
                ? "border-black/20 bg-black/[0.02] shadow-sm"
                : "border-black/10"
            }`}
          >
            <p className="mb-1 text-[15px] font-medium">Tarjeta de circulación</p>
            <p className="mb-4 text-[13px] leading-relaxed text-black/50">
              {isFirstVehicle
                ? "Empieza aquí: sube la tarjeta y detectamos placa, marca y estado automáticamente."
                : "Sube foto o PDF para llenar placa, marca y estado automáticamente."}
            </p>
            <button
              type="button"
              disabled={scanning}
              onClick={() => fileRef.current?.click()}
              className="btn-primary w-full py-3 text-[15px]"
            >
              {scanning ? "Leyendo tarjeta…" : "Escanear tarjeta"}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,image/*,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCardFile(file);
                e.target.value = "";
              }}
            />
            {scanFileName && !scanning && (
              <p className="mt-2 text-[11px] text-black/40">
                {scanFileName}
                {cardScanFile && " · se guardará como documento al crear el auto"}
              </p>
            )}
            {scanError && (
              <p className="mt-2 text-sm text-black/70">{scanError}</p>
            )}
            {scanHint && (
              <p className="mt-2 text-sm text-black/55">{scanHint}</p>
            )}
            {scanPreview && (
              <dl className="mt-3 space-y-1 border-t border-black/10 pt-3 text-[13px]">
                {scanPreview.placa && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Placa</dt>
                    <dd>{String(scanPreview.placa)}</dd>
                  </div>
                )}
                {scanPreview.marca && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Marca</dt>
                    <dd>{String(scanPreview.marca)}</dd>
                  </div>
                )}
                {scanPreview.submarca && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Submarca</dt>
                    <dd>{String(scanPreview.submarca)}</dd>
                  </div>
                )}
                {scanPreview.modelo && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Modelo</dt>
                    <dd>{String(scanPreview.modelo)}</dd>
                  </div>
                )}
                {scanPreview.anio && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Modelo (año)</dt>
                    <dd>{String(scanPreview.anio)}</dd>
                  </div>
                )}
                {(scanPreview.niv || scanPreview.nombre || scanPreview.propietario) && (
                  <>
                    {scanPreview.niv && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-black/50">NIV</dt>
                        <dd className="text-right">{String(scanPreview.niv)}</dd>
                      </div>
                    )}
                    {(scanPreview.nombre || scanPreview.propietario) && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-black/50">Nombre</dt>
                        <dd className="text-right">
                          {String(scanPreview.nombre ?? scanPreview.propietario)}
                        </dd>
                      </div>
                    )}
                  </>
                )}
                {scanPreview.cilindros != null && scanPreview.cilindros !== "" && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Cilindros</dt>
                    <dd>{String(scanPreview.cilindros)}</dd>
                  </div>
                )}
                {scanPreview.fecha_expedicion && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Expedición</dt>
                    <dd>{String(scanPreview.fecha_expedicion)}</dd>
                  </div>
                )}
                {scanPreview.fecha_vencimiento && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Vencimiento</dt>
                    <dd>{String(scanPreview.fecha_vencimiento)}</dd>
                  </div>
                )}
                {scanPreview.entidad && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-black/50">Entidad</dt>
                    <dd>{String(scanPreview.entidad)}</dd>
                  </div>
                )}
              </dl>
            )}
            <p className="mt-4 text-center text-[11px] uppercase tracking-wide text-black/30">
              {isFirstVehicle ? "o captura los datos a mano abajo" : "o ingresa manualmente"}
            </p>
          </section>
        )}

        <Field label="Alias (opcional)">
          <input
            className="field-input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Ejemplo: Jetta"
          />
        </Field>
        <Field label="Marca (opcional)">
          <input
            className="field-input"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Ejemplo: Volkswagen"
          />
        </Field>
        <Field label="Modelo (año)">
          <input
            type="number"
            inputMode="numeric"
            min={1950}
            max={2100}
            className="field-input"
            value={modelYear}
            onChange={(e) => setModelYear(e.target.value)}
            placeholder="Ejemplo: 2020"
          />
        </Field>
        <Field label="Placa (opcional)">
          <input
            className="field-input"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Ejemplo: ABC-123-4"
          />
        </Field>
        <Field label="Estado">
          <select
            className="field-input"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            {MX_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo de vehículo">
          <select
            className="field-input"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          >
            {VEHICLE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {vehicleType === "moto" && state === "CDMX" && (
            <p className="mt-1 text-[12px] text-black/45">
              Las motocicletas están exentas del Hoy No Circula y de contingencia ambiental.
            </p>
          )}
        </Field>
        <Field label="Holograma de verificación">
          <select
            className="field-input"
            value={calcomania}
            onChange={(e) => setCalcomania(e.target.value as Calcomania | "")}
          >
            <option value="">Sin especificar</option>
            {CALCOMANIA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {state === "CDMX" && vehicleType !== "moto" && (
            <p className="mt-1 text-[12px] text-black/45">
              Con holograma 0 circulas todos los días, salvo contingencia ambiental.
            </p>
          )}
        </Field>
        <Field label="NIV / No. de serie (opcional)">
          <input
            className="field-input"
            value={niv}
            onChange={(e) => setNiv(e.target.value.toUpperCase())}
            placeholder="Ejemplo: 3N1AB7AP5KY123456"
          />
        </Field>
        <Field label="Nombre (opcional)">
          <input
            className="field-input"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Ejemplo: Juan Pérez García"
          />
        </Field>
        <Field label="Cilindros (opcional)">
          <input
            type="number"
            min={1}
            className="field-input"
            value={cylinders}
            onChange={(e) => setCylinders(e.target.value)}
            placeholder="Ejemplo: 4"
          />
        </Field>
        <Field label="Expedición tarjeta (opcional)">
          <input
            className="field-input"
            value={cardIssueDate}
            onChange={(e) => setCardIssueDate(e.target.value)}
            placeholder="Ejemplo: 01/06/2026"
          />
        </Field>
        <Field label="Vencimiento tarjeta (opcional)">
          <input
            className="field-input"
            value={cardExpiryDate}
            onChange={(e) => setCardExpiryDate(e.target.value)}
            placeholder="Ejemplo: 01/06/2031"
          />
        </Field>
        <Field label="Verificación">
          <input
            type="date"
            className="field-input"
            value={verificationDate}
            onChange={(e) => setVerificationDate(e.target.value)}
          />
        </Field>
        <Field label="Tenencia">
          <input
            type="date"
            className="field-input"
            value={tenenciaDate}
            onChange={(e) => setTenenciaDate(e.target.value)}
          />
        </Field>
        <Field label="Refrendo">
          <input
            type="date"
            className="field-input"
            value={refrendoDate}
            onChange={(e) => setRefrendoDate(e.target.value)}
          />
        </Field>
        <Field label="Próximo servicio">
          <input
            type="date"
            className="field-input"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
          />
        </Field>
        <Field label="Km servicio (opcional)">
          <input
            type="number"
            className="field-input"
            value={serviceKm}
            onChange={(e) => setServiceKm(e.target.value)}
            placeholder="Ejemplo: 80000"
          />
        </Field>

        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="text-sm text-black underline underline-offset-2"
        >
          {showMore ? "Ocultar opciones" : "Más opciones"}
        </button>

        {showMore && (
          <div className="space-y-3 rounded-lg border border-black/10 p-3">
            <p className="text-[13px] text-black/50">Recordatorios (días antes)</p>
            <div className="flex flex-wrap gap-2">
              {[30, 15, 7, 1].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleReminder(d)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    reminderDays.includes(d)
                      ? "bg-black text-white"
                      : "border border-black/20"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Toggle
              label="Notificación en iPhone"
              checked={localNotifications}
              onChange={setLocalNotifications}
              disabled={!native}
              hint={!native ? "Disponible en app iOS" : undefined}
            />
            <Toggle
              label="Agregar al Calendario"
              checked={calendarSync}
              onChange={setCalendarSync}
              disabled={!native}
              hint={!native ? "Disponible en app iOS" : undefined}
            />
            <Toggle
              label="Incluir en resumen por email"
              checked={includeInEmail}
              onChange={setIncludeInEmail}
            />
          </div>
        )}
      </div>

      <div className="mt-auto space-y-2 border-t border-black/10 bg-white px-4 py-4">
        {saveError && (
          <p className="text-sm text-black/70">{saveError}</p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="btn-primary w-full py-2.5"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {onDelete && (
          confirmDelete ? (
            <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
              <p className="text-sm text-black/70">
                ¿Eliminar este vehículo y todos sus documentos? No se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="flex-1 rounded-lg border border-black/15 py-2 text-sm text-black"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await onDelete();
                    } finally {
                      setDeleting(false);
                      setConfirmDelete(false);
                    }
                  }}
                  className="flex-1 rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 text-sm text-black/60 underline underline-offset-2"
            >
              Eliminar vehículo
            </button>
          )
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-black/50">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <span className="text-[15px]">{label}</span>
        {hint && <p className="text-[11px] text-black/40">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? "bg-black" : "bg-black/15"
        } ${disabled ? "opacity-40" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
