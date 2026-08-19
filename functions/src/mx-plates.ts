/** National passenger-plate letter blocks (NOM-001-SCT-2-2016). */
const PASSENGER_SERIES: Array<{ from: string; to: string; state: string }> = [
  { from: "AAA", to: "AFZ", state: "AGS" },
  { from: "AGA", to: "CYZ", state: "BC" },
  { from: "CZA", to: "DEZ", state: "BCS" },
  { from: "DFA", to: "DKZ", state: "CAMP" },
  { from: "DLA", to: "DSZ", state: "CHIS" },
  { from: "DTA", to: "ETZ", state: "CHIH" },
  { from: "EUA", to: "FPZ", state: "COAH" },
  { from: "FRA", to: "FWZ", state: "COL" },
  { from: "FXA", to: "GFZ", state: "DGO" },
  { from: "GGA", to: "GYZ", state: "GTO" },
  { from: "GZA", to: "HFZ", state: "GRO" },
  { from: "HGA", to: "HRZ", state: "HGO" },
  { from: "HSA", to: "LFZ", state: "JAL" },
  { from: "LGA", to: "PEZ", state: "EDOMEX" },
  { from: "PFA", to: "PUZ", state: "MICH" },
  { from: "PVA", to: "RDZ", state: "MOR" },
  { from: "REA", to: "RJZ", state: "NAY" },
  { from: "RKA", to: "TGZ", state: "NL" },
  { from: "THA", to: "TMZ", state: "OAX" },
  { from: "TNA", to: "UJZ", state: "PUE" },
  { from: "UKA", to: "UPZ", state: "QRO" },
  { from: "URA", to: "UVZ", state: "QR" },
  { from: "UWA", to: "VEZ", state: "SLP" },
  { from: "VFA", to: "VSZ", state: "SIN" },
  { from: "VTA", to: "WKZ", state: "SON" },
  { from: "WLA", to: "WWZ", state: "TAB" },
  { from: "WXA", to: "XSZ", state: "TAMPS" },
  { from: "XTA", to: "XXZ", state: "TLAX" },
  { from: "XYA", to: "YVZ", state: "VER" },
  { from: "YWA", to: "ZCZ", state: "YUC" },
  { from: "ZDA", to: "ZHZ", state: "ZAC" },
];

export function normalizePlateKey(plate: string | null | undefined): string {
  return (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function seriesState(letters: string): string | null {
  const match = PASSENGER_SERIES.find(
    (entry) => letters >= entry.from && letters <= entry.to,
  );
  return match?.state ?? null;
}

export function inferStateFromPlate(
  plate: string | null | undefined,
): string | null {
  const key = normalizePlateKey(plate);
  if (key.length < 6 || key === "PENDIENTE" || key === "PERMISO") return null;

  if (/^[A-Z]\d{2}[A-Z]{3}$/.test(key)) return "CDMX";
  if (/^\d{3}[A-Z]{3}$/.test(key)) return "CDMX";

  const passenger = key.match(/^([A-Z]{3})\d{3,4}[A-Z]?$/);
  if (passenger) return seriesState(passenger[1]);

  return null;
}

export function resolveVehicleState(
  plate: string | null | undefined,
  fallback?: string | null,
): string {
  return inferStateFromPlate(plate) || fallback?.trim() || "CDMX";
}
