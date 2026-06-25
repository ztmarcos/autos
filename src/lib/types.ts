export type DocumentType =
  | "tarjeta_circulacion"
  | "poliza_seguro"
  | "factura"
  | "tenencia"
  | "verificacion"
  | "servicio"
  | "otro";

export type EventType = "verificacion" | "tenencia" | "refrendo" | "servicio" | "seguro";

export type NotificationType =
  | "verificacion"
  | "tenencia"
  | "refrendo"
  | "servicio"
  | "seguro"
  | "general";

export interface UserPreferences {
  emailEnabled: boolean;
  monthlyReport: boolean;
  localNotifications: boolean;
  calendarSync: boolean;
  pushEnabled: boolean;
  defaultReminderDays: number[];
  gmailAccessToken?: string;
  gmailRefreshToken?: string;
  gmailTokenExpiry?: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  emailEnabled: true,
  monthlyReport: false,
  localNotifications: true,
  calendarSync: false,
  pushEnabled: false,
  defaultReminderDays: [7, 1],
};

export type VehicleType = "auto" | "moto";

export type Calcomania = "0" | "00" | "1" | "2";

export const CALCOMANIA_OPTIONS: Array<{ value: Calcomania; label: string }> = [
  { value: "0", label: "Holograma 0 — Exento (circula diario)" },
  { value: "00", label: "Holograma 00 — Eléctrico / híbrido" },
  { value: "1", label: "Holograma 1 — Restricciones normales" },
  { value: "2", label: "Holograma 2 — Mayor restricción" },
];

export const VEHICLE_TYPE_OPTIONS: Array<{ value: VehicleType; label: string }> = [
  { value: "auto", label: "Automóvil" },
  { value: "moto", label: "Motocicleta" },
];

export interface Vehicle {
  id: string;
  userId: string;
  alias?: string;
  plate: string;
  state: string;
  vehicleType?: VehicleType;
  calcomania?: Calcomania;
  brand?: string;
  brandLogoKey?: string;
  brandLogoPath?: string;
  brandLogoStatus?: "generating" | "ready" | "failed";
  niv?: string;
  cylinders?: number;
  ownerName?: string;
  cardIssueDate?: string;
  cardExpiryDate?: string;
  verificationDate?: string;
  tenenciaDate?: string;
  refrendoDate?: string;
  serviceDate?: string;
  lastServiceDate?: string;
  insuranceExpiryDate?: string;
  modelYear?: number;
  serviceKm?: number;
  currentKm?: number;
  reminderDays: number[];
  localNotifications: boolean;
  calendarSync: boolean;
  includeInEmail: boolean;
  calendarEventIds?: Record<string, string>;
  casinAutoId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleEvent {
  id: string;
  type: EventType;
  date: string;
  description?: string;
  amount?: number;
  km?: number;
  createdAt: Date;
}

export interface AppNotification {
  id: string;
  userId: string;
  vehicleId: string;
  vehicleName: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface VehicleDocument {
  id: string;
  status: "uploading" | "processing" | "ready" | "error";
  storagePath: string;
  thumbnailPath?: string;
  mimeType: string;
  fileName: string;
  displayName?: string;
  detectedType?: DocumentType;
  detectedTypeLabel?: string;
  confidence?: number;
  extractedFields?: Record<string, string | number | null>;
  rawTextLength?: number;
  errorMessage?: string;
  createdAt: Date;
  processedAt?: Date;
}

export interface UpcomingItem {
  type: EventType;
  label: string;
  date: string;
  daysUntil: number;
  overdue: boolean;
}

export type UrgencyStatus = "ok" | "warning" | "danger";

export interface VehicleExpiryTag {
  type: EventType;
  label: string;
  date: string;
  daysUntil: number;
  urgency: UrgencyStatus;
}

export interface MxVehicleRule {
  stateCode: string;
  stateName: string;
  verificationSchedule: Record<string, string>;
  tenenciaNote: string;
  officialSourceUrl: string;
  lastUpdated: string;
}

export type VehicleNewsCategory =
  | "no_circula"
  | "placas"
  | "verificacion"
  | "tenencia"
  | "general";

export interface StateNewsAlert {
  id: string;
  title: string;
  summary: string;
  category: VehicleNewsCategory;
  stateCodes: string[];
  plateDigits?: string[];
  /** Hologramas/calcomanías afectados (p. ej. ["1","2"] en contingencia). */
  affectedHolograms?: string[];
  sourceUrl: string;
  publishedAt: string;
  severity: "info" | "warning" | "urgent";
}

export interface MxStateNews {
  stateCode: string;
  lastFetchedAt: string;
  alerts: StateNewsAlert[];
}

export type View =
  | "home"
  | "detail"
  | "form"
  | "settings"
  | "alerts"
  | "document";
