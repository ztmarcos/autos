import { inferVehicleTypeFromText, type VehicleType } from "./no-circula";
import { resolveVehicleState } from "./mx-plates";

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

export function todayInMexicoCity(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isCasinPolicyVigente(
  auto: CasinAutoRecord,
  today: string = todayInMexicoCity(),
): boolean {
  const iso = parseVehicleDateLiteral(auto.vigencia_fin);
  if (!iso) return false;
  return iso >= today;
}

export function filterVigenteCasinAutos(
  autos: CasinAutoRecord[],
  today: string = todayInMexicoCity(),
): CasinAutoRecord[] {
  return autos.filter((auto) => isCasinPolicyVigente(auto, today));
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

export function casinVehicleIdentityKey(input: {
  id?: string;
  serie?: string | null;
  niv?: string | null;
  placas?: string | null;
  plate?: string | null;
}): string {
  const niv = (input.serie || input.niv || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
  if (niv.length >= 8) return `niv:${niv}`;

  const plate = normalizeCasinPlate(input.placas || input.plate).replace(
    /\s+/g,
    "",
  );
  if (plate && plate !== "PENDIENTE" && plate !== "PERMISO") {
    return `plate:${plate}`;
  }

  return input.id ? `auto:${input.id}` : "auto:unknown";
}

function scoreCasinAuto(auto: CasinAutoRecord): number {
  let score = 0;
  if (normalizeCasinEmail(auto.e_mail)) score += 8;
  if (auto.serie?.trim()) score += 6;
  const description = auto.descripcion_del_vehiculo?.trim() ?? "";
  score += Math.min(description.length, 80) / 20;
  if (auto.numero_poliza?.trim()) score += 2;
  if (auto.aseguradora?.trim()) score += 1;

  const expiry = parseVehicleDateLiteral(auto.vigencia_fin);
  if (expiry) {
    const time = Date.parse(`${expiry}T00:00:00`);
    if (Number.isFinite(time)) score += 50 + time / 1e11;
  }

  return score;
}

export function dedupeCasinAutos(autos: CasinAutoRecord[]): CasinAutoRecord[] {
  const byKey = new Map<string, CasinAutoRecord>();
  for (const auto of autos) {
    if (!auto.id?.trim()) continue;
    const key = casinVehicleIdentityKey(auto);
    const existing = byKey.get(key);
    if (!existing || scoreCasinAuto(auto) > scoreCasinAuto(existing)) {
      byKey.set(key, auto);
    }
  }
  return [...byKey.values()];
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

export function cleanClientDisplayName(
  value: string | null | undefined,
): string | undefined {
  const name = value?.replace(/^[\s"'“”«»]+|[\s"'“”«»]+$/g, "").trim();
  return name || undefined;
}

export function normalizeCasinClientName(
  value: string | null | undefined,
): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["«»„”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || undefined;
}

export function casinClientNameKey(
  value: string | null | undefined,
): string | undefined {
  const normalized = normalizeCasinClientName(value);
  if (!normalized) return undefined;
  const tokens = [...new Set(normalized.split(" ").filter(Boolean))].sort();
  return tokens.join(" ") || undefined;
}

export function casinGroupKeyFromNameKey(nameKey: string): string {
  return `name:${nameKey.replace(/\s+/g, "-")}`;
}

export function normalizeCasinRfc(
  value: string | null | undefined,
): string | undefined {
  const rfc = value
    ?.trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9Ñ&]/g, "");
  if (!rfc) return undefined;
  if (rfc.length !== 12 && rfc.length !== 13) return undefined;
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return undefined;
  return rfc;
}

export function clientNamesCompatible(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const tokensA = new Set(
    (normalizeCasinClientName(left) ?? "").split(" ").filter(Boolean),
  );
  const tokensB = new Set(
    (normalizeCasinClientName(right) ?? "").split(" ").filter(Boolean),
  );
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  const min = Math.min(tokensA.size, tokensB.size);
  if (intersection >= 2) return true;
  return intersection === min && intersection >= 1;
}

export function pickGroupEmail(
  autos: CasinAutoRecord[],
): string | undefined {
  const counts = new Map<string, number>();
  for (const auto of autos) {
    const email = normalizeCasinEmail(auto.e_mail);
    if (!email) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = 0;
  for (const [email, count] of counts) {
    if (count > bestCount) {
      best = email;
      bestCount = count;
    }
  }
  return best;
}

export function resolveContractorName(
  auto: CasinAutoRecord,
): string | undefined {
  const contratante = cleanClientDisplayName(auto.contratante);
  if (contratante) return contratante;

  const nombre = cleanClientDisplayName(auto.nombre_contratante);
  if (nombre) return nombre;

  return undefined;
}

export function resolveClientName(
  autos: CasinAutoRecord[],
): string | undefined {
  const counts = new Map<string, { name: string; count: number }>();
  for (const auto of autos) {
    const name = resolveContractorName(auto);
    if (!name) continue;
    const key = casinClientNameKey(name) ?? name.toLowerCase();
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      if (name.length > current.name.length) current.name = name;
      continue;
    }
    counts.set(key, { name, count: 1 });
  }

  let best: { name: string; count: number } | undefined;
  for (const item of counts.values()) {
    if (
      !best ||
      item.count > best.count ||
      (item.count === best.count && item.name.length > best.name.length)
    ) {
      best = item;
    }
  }
  return best?.name;
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
    state: resolveVehicleState(
      plate,
      inferStateFromAddress(auto.domicilio_o_direccion),
    ),
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

export function formatCasinDateForDisplay(
  value: string | number | null | undefined,
): string | undefined {
  const iso = parseVehicleDateLiteral(value);
  if (iso) {
    const [year, month, day] = iso.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  const raw = value == null ? "" : String(value).trim();
  return raw || undefined;
}

function extractModelFromDescription(
  description: string | null | undefined,
  brand?: string,
): string | undefined {
  let raw = description?.replace(/^\(I\)\s*/i, "").trim() ?? "";
  if (!raw) return undefined;
  if (brand) {
    const upper = raw.toUpperCase();
    const brandUpper = brand.toUpperCase();
    if (upper.startsWith(brandUpper)) {
      raw = raw.slice(brand.length).trim();
    }
  }
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return words || undefined;
}

export function mapCasinAutoToPolizaFields(
  auto: CasinAutoRecord,
  clientLabel?: string,
): Record<string, string | number | null> {
  const mapped = mapCasinAutoToVehicle(auto, clientLabel);
  const description = auto.descripcion_del_vehiculo?.trim();
  const fields: Record<string, string | number | null> = {};

  const aseguradora = auto.aseguradora?.trim();
  const noPoliza = auto.numero_poliza?.trim();
  const asegurado =
    resolveContractorName(auto) || clientLabel?.trim() || mapped.ownerName;
  const modelo = extractModelFromDescription(description, mapped.brand);
  const vigenciaInicio = formatCasinDateForDisplay(auto.vigencia_inicio);
  const vigenciaFin = formatCasinDateForDisplay(auto.vigencia_fin);
  const tipo = auto.tipo_de_vehiculo?.trim();

  if (aseguradora) fields.aseguradora = aseguradora;
  if (noPoliza) fields.no_poliza = noPoliza;
  if (asegurado) fields.nombre_asegurado = asegurado;
  if (mapped.plate && mapped.plate !== "PENDIENTE") fields.placa = mapped.plate;
  if (mapped.niv) fields.niv = mapped.niv;
  if (mapped.brand) fields.marca = mapped.brand;
  if (modelo) fields.modelo = modelo;
  if (mapped.modelYear) fields.anio = mapped.modelYear;
  if (tipo) fields.tipo_vehiculo = tipo;
  if (vigenciaInicio) fields.vigencia_inicio = vigenciaInicio;
  if (vigenciaFin) fields.vigencia_fin = vigenciaFin;

  return fields;
}

function findClusterRoot(
  parent: Map<string, string>,
  id: string,
): string {
  const current = parent.get(id) ?? id;
  if (current === id) return id;
  const root = findClusterRoot(parent, current);
  parent.set(id, root);
  return root;
}

function unionClusters(
  parent: Map<string, string>,
  rank: Map<string, number>,
  left: string,
  right: string,
): void {
  const rootA = findClusterRoot(parent, left);
  const rootB = findClusterRoot(parent, right);
  if (rootA === rootB) return;

  const rankA = rank.get(rootA) ?? 0;
  const rankB = rank.get(rootB) ?? 0;
  if (rankA < rankB) {
    parent.set(rootA, rootB);
    return;
  }
  parent.set(rootB, rootA);
  if (rankA === rankB) rank.set(rootA, rankA + 1);
}

export function listCasinGroupLookupKeys(group: CasinUserGroup): string[] {
  const keys = new Set<string>([group.groupKey]);
  if (group.email) keys.add(`email:${group.email}`);

  for (const auto of group.autos) {
    keys.add(`auto:${auto.id}`);
    const email = normalizeCasinEmail(auto.e_mail);
    if (email) keys.add(`email:${email}`);
    const nameKey = casinClientNameKey(resolveContractorName(auto));
    if (nameKey) keys.add(casinGroupKeyFromNameKey(nameKey));
  }

  return [...keys];
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (longer.length - shorter.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (shorter.length === longer.length) i += 1;
    j += 1;
  }
  if (i < shorter.length || j < longer.length) edits += 1;
  return edits <= 1;
}

function nameKeysLookLikeSameClient(left: string, right: string): boolean {
  const tokensA = left.split(" ").filter(Boolean);
  const tokensB = right.split(" ").filter(Boolean);
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  if (intersection < 2) return false;

  const onlyA = tokensA.filter((token) => !setB.has(token));
  const onlyB = tokensB.filter((token) => !setA.has(token));
  if (onlyA.length === 0 || onlyB.length === 0) return true;
  if (onlyA.length === 1 && onlyB.length === 1) {
    return editDistanceAtMostOne(onlyA[0], onlyB[0]);
  }
  return false;
}

export function buildCasinUserGroups(records: CasinAutoRecord[]): CasinUserGroup[] {
  const autos = records.filter((auto) => Boolean(auto.id?.trim()));
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  for (const auto of autos) {
    parent.set(auto.id, auto.id);
    rank.set(auto.id, 0);
  }

  const byNameKey = new Map<string, string>();
  for (const auto of autos) {
    const nameKey = casinClientNameKey(resolveContractorName(auto));
    if (!nameKey) continue;
    const existing = byNameKey.get(nameKey);
    if (existing) {
      unionClusters(parent, rank, existing, auto.id);
      continue;
    }
    byNameKey.set(nameKey, auto.id);
  }

  const nameKeyList = [...byNameKey.keys()];
  for (let i = 0; i < nameKeyList.length; i += 1) {
    for (let j = i + 1; j < nameKeyList.length; j += 1) {
      const left = nameKeyList[i];
      const right = nameKeyList[j];
      if (!nameKeysLookLikeSameClient(left, right)) continue;
      unionClusters(parent, rank, byNameKey.get(left)!, byNameKey.get(right)!);
    }
  }

  const rfcClusters: Array<{ rfc: string; rootId: string; sampleName: string }> =
    [];
  for (const auto of autos) {
    const rfc = normalizeCasinRfc(auto.rfc);
    const name = resolveContractorName(auto);
    if (!rfc || !name) continue;

    const match = rfcClusters.find(
      (cluster) =>
        cluster.rfc === rfc && clientNamesCompatible(cluster.sampleName, name),
    );
    if (match) {
      unionClusters(parent, rank, match.rootId, auto.id);
      continue;
    }
    rfcClusters.push({ rfc, rootId: auto.id, sampleName: name });
  }

  const buckets = new Map<string, CasinAutoRecord[]>();
  for (const auto of autos) {
    const root = findClusterRoot(parent, auto.id);
    const list = buckets.get(root) ?? [];
    list.push(auto);
    buckets.set(root, list);
  }

  return Array.from(buckets.values()).map((groupAutos) => {
    const clientName = resolveClientName(groupAutos);
    const email = pickGroupEmail(groupAutos);
    const displayName = resolveGroupClientLabel(groupAutos, email);
    const nameKey = casinClientNameKey(clientName);
    const groupKey = nameKey
      ? casinGroupKeyFromNameKey(nameKey)
      : email
        ? `email:${email}`
        : `auto:${groupAutos[0].id}`;

    return {
      groupKey,
      email,
      clientName,
      displayName,
      autos: groupAutos,
    };
  });
}

export function isValidAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}
