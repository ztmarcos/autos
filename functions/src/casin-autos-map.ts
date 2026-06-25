import { inferVehicleTypeFromText, type VehicleType } from "./no-circula";

export const CASIN_AUTOS_URL = "https://casin-crm.web.app/sync/autos.json";

export interface CasinAutoRecord {
  id: string;
  contratante?: string;
  nombre_contratante?: string;
  rfc?: string;
  e_mail?: string;
  domicilio_o_direccion?: string;
  numero_poliza?: string;
  aseguradora?: string;
  vigencia_inicio?: string;
  vigencia_fin?: string;
  forma_de_pago?: string;
  tipo_de_vehiculo?: string;
  descripcion_del_vehiculo?: string;
  serie?: string;
  modelo?: string | number;
  placas?: string;
  motor?: string;
  uso?: string;
}

export interface CasinAutosPayload {
  source?: string;
  collection?: string;
  generatedAt?: string;
  count?: number;
  data: CasinAutoRecord[];
}

export interface MappedCasinVehicle {
  casinAutoId: string;
  plate: string;
  state: string;
  vehicleType: VehicleType;
  niv?: string;
  alias?: string;
  brand?: string;
  ownerName?: string;
  modelYear?: number;
  insuranceExpiryDate?: string;
}

export interface CasinUserGroup {
  groupKey: string;
  email?: string;
  clientName?: string;
  displayName: string;
  autos: CasinAutoRecord[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T\s]/;
const MX_SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const MX_DASH_DATE = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/;
const MX_DOT_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
const MX_COMPACT_DATE = /^(\d{2})(\d{2})(\d{4})$/;
const MX_TEXT_MONTH_DATE =
  /^(\d{1,2})[\s/.-]+([a-záéíóúñ]+)[\s/.-]+(\d{2,4})$/i;
const MX_TEXT_MONTH_DE_DATE =
  /^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\s+(?:de\s+)?(\d{2,4})$/i;

const SPANISH_MONTHS: Record<string, string> = {
  ene: "01",
  enero: "01",
  feb: "02",
  febrero: "02",
  mar: "03",
  marzo: "03",
  abr: "04",
  abril: "04",
  may: "05",
  mayo: "05",
  jun: "06",
  junio: "06",
  jul: "07",
  julio: "07",
  ago: "08",
  agosto: "08",
  sep: "09",
  sept: "09",
  septiembre: "09",
  setiembre: "09",
  oct: "10",
  octubre: "10",
  nov: "11",
  noviembre: "11",
  dic: "12",
  diciembre: "12",
};

const KNOWN_BRANDS = [
  "MERCEDES BENZ",
  "MERCEDES-BENZ",
  "MERCEDES",
  "CHEVROLET",
  "VOLKSWAGEN",
  "LAND ROVER",
  "RANGE ROVER",
  "AUDI",
  "BMW",
  "NISSAN",
  "TOYOTA",
  "HONDA",
  "MAZDA",
  "KIA",
  "HYUNDAI",
  "FORD",
  "JEEP",
  "DODGE",
  "RAM",
  "GMC",
  "VOLVO",
  "PORSCHE",
  "MINI",
  "SEAT",
  "PEUGEOT",
  "RENAULT",
  "FIAT",
  "SUZUKI",
  "MITSUBISHI",
  "SUBARU",
  "LEXUS",
  "INFINITI",
  "ACURA",
  "CADILLAC",
  "LINCOLN",
  "BUICK",
  "CHRYSLER",
  "TESLA",
  "JAC",
  "MG",
];

function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function normalizeYear(year: string): string {
  if (year.length === 2) {
    const n = parseInt(year, 10);
    return String(n >= 50 ? 1900 + n : 2000 + n);
  }
  return year;
}

function normalizeMonthToken(token: string): string | undefined {
  const key = token
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return SPANISH_MONTHS[key];
}

function toIsoDate(year: string, month: string, day: string): string | undefined {
  const iso = `${normalizeYear(year)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : undefined;
}

function stripTimeComponent(raw: string): string {
  return raw
    .replace(
      /\s+[Tt]?\d{1,2}:\d{2}(:\d{2})?(\s*(hrs?|h|am|pm|a\.?\s*m\.?|p\.?\s*m\.?))?.*$/i,
      "",
    )
    .trim();
}

function parseDayMonthYear(
  day: string,
  month: string,
  year: string,
): string | undefined {
  const monthNum = /^\d{1,2}$/.test(month)
    ? month
    : normalizeMonthToken(month);
  if (!monthNum) return undefined;
  return toIsoDate(year, monthNum, day);
}

function parseTextMonthDate(raw: string): string | undefined {
  const deMatch = raw.match(MX_TEXT_MONTH_DE_DATE);
  if (deMatch) {
    const [, day, month, year] = deMatch;
    return parseDayMonthYear(day, month, year);
  }

  const match = raw.match(MX_TEXT_MONTH_DATE);
  if (match) {
    const [, day, month, year] = match;
    return parseDayMonthYear(day, month, year);
  }

  return undefined;
}

export function parseVehicleDateLiteral(
  value: string | number | null | undefined,
): string | undefined {
  if (value == null) return undefined;
  let raw = String(value).trim();
  if (!raw || raw === "Invalid Date") return undefined;

  const isoDateTime = raw.match(ISO_DATE_TIME);
  if (isoDateTime) {
    return isValidIsoDate(isoDateTime[1]) ? isoDateTime[1] : undefined;
  }

  if (ISO_DATE.test(raw)) {
    return isValidIsoDate(raw) ? raw : undefined;
  }

  raw = stripTimeComponent(raw);

  const slash = raw.match(MX_SLASH_DATE);
  if (slash) {
    const [, day, month, year] = slash;
    return parseDayMonthYear(day, month, year);
  }

  const dash = raw.match(MX_DASH_DATE);
  if (dash) {
    const [, day, month, year] = dash;
    return parseDayMonthYear(day, month, year);
  }

  const dot = raw.match(MX_DOT_DATE);
  if (dot) {
    const [, day, month, year] = dot;
    return parseDayMonthYear(day, month, year);
  }

  const compact = raw.match(MX_COMPACT_DATE);
  if (compact) {
    const [, day, month, year] = compact;
    return parseDayMonthYear(day, month, year);
  }

  return parseTextMonthDate(raw);
}

export function normalizeCasinEmail(
  value: string | null | undefined,
): string | undefined {
  const email = value?.trim().toLowerCase();
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  return email;
}

export function normalizeCasinPlate(value: string | null | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw) return "PENDIENTE";
  return raw
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function extractBrandFromDescription(
  description: string | null | undefined,
): string | undefined {
  if (!description?.trim()) return undefined;
  const upper = description.toUpperCase();
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand)) {
      if (brand === "MERCEDES" || brand === "MERCEDES-BENZ") {
        return "MERCEDES BENZ";
      }
      if (brand === "VOLKSWAGEN") return "VOLKSWAGEN";
      return brand;
    }
  }
  return undefined;
}

export function buildVehicleAlias(
  description: string | null | undefined,
  plate: string,
): string | undefined {
  const raw = description?.trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/^\(I\)\s*/i, "").trim();
  if (!cleaned) return undefined;
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return words || plate;
}

export function inferStateFromAddress(
  address: string | null | undefined,
): string {
  const raw = address?.trim().toLowerCase() ?? "";
  if (!raw) return "CDMX";

  if (
    raw.includes("distrito federal") ||
    raw.includes("ciudad de mexico") ||
    raw.includes("ciudad de méxico") ||
    /\bcdmx\b/.test(raw)
  ) {
    return "CDMX";
  }

  if (
    raw.includes("estado de mexico") ||
    raw.includes("estado de méxico") ||
    raw.includes("edomex") ||
    /\bmex\b/.test(raw)
  ) {
    return "EDOMEX";
  }

  if (raw.includes("jalisco") || /\bjal\b/.test(raw)) return "JAL";
  if (raw.includes("nuevo leon") || raw.includes("nuevo león") || /\bnl\b/.test(raw)) {
    return "NL";
  }
  if (raw.includes("puebla") || /\bpue\b/.test(raw)) return "PUE";

  return "CDMX";
}

export function parseModelYear(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const year = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return undefined;
  return year;
}

export function resolveContractorName(
  auto: CasinAutoRecord,
): string | undefined {
  const contratante = auto.contratante?.trim();
  if (contratante) return contratante;

  const nombre = auto.nombre_contratante?.trim();
  if (nombre) return nombre;

  return undefined;
}

export function resolveClientName(
  autos: CasinAutoRecord[],
): string | undefined {
  for (const auto of autos) {
    const name = resolveContractorName(auto);
    if (name) return name;
  }
  return undefined;
}

export function formatClientLabelFromEmail(email: string): string {
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!local) return email;
  return local
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function resolveGroupClientLabel(
  autos: CasinAutoRecord[],
  email?: string,
): string {
  const clientName = resolveClientName(autos);
  if (clientName) return clientName;

  const safeEmail = email ? normalizeCasinEmail(email) : undefined;
  if (safeEmail) return formatClientLabelFromEmail(safeEmail);

  const plate = normalizeCasinPlate(autos[0]?.placas);
  return plate !== "PENDIENTE" ? `Cliente · ${plate}` : "Cliente";
}

export function resolveGroupDisplayName(
  autos: CasinAutoRecord[],
  email?: string,
): string {
  return resolveGroupClientLabel(autos, email);
}

export function mapCasinAutoToVehicle(
  auto: CasinAutoRecord,
  clientLabel?: string,
): MappedCasinVehicle {
  const plate = normalizeCasinPlate(auto.placas);
  const description = auto.descripcion_del_vehiculo?.trim();
  const ownerName = clientLabel?.trim() || undefined;
  const vehicleType =
    inferVehicleTypeFromText(auto.tipo_de_vehiculo, description) ?? "auto";

  return {
    casinAutoId: auto.id,
    plate,
    state: inferStateFromAddress(auto.domicilio_o_direccion),
    vehicleType,
    niv: auto.serie?.trim() || undefined,
    alias: buildVehicleAlias(description, plate),
    brand: extractBrandFromDescription(description),
    ownerName,
    modelYear: parseModelYear(auto.modelo),
    insuranceExpiryDate:
      parseVehicleDateLiteral(auto.vigencia_fin) ?? auto.vigencia_fin?.trim(),
  };
}

export function buildCasinUserGroups(records: CasinAutoRecord[]): CasinUserGroup[] {
  const groups = new Map<string, CasinUserGroup>();

  for (const auto of records) {
    if (!auto.id?.trim()) continue;

    const email = normalizeCasinEmail(auto.e_mail);
    const groupKey = email ? `email:${email}` : `auto:${auto.id}`;

    const existing = groups.get(groupKey);
    if (existing) {
      existing.autos.push(auto);
      continue;
    }

    groups.set(groupKey, {
      groupKey,
      email,
      displayName: "",
      autos: [auto],
    });
  }

  return Array.from(groups.values()).map((group) => {
    const clientName = resolveClientName(group.autos);
    const displayName = resolveGroupClientLabel(group.autos, group.email);
    return {
      ...group,
      clientName,
      displayName,
    };
  });
}

export function isValidAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}
