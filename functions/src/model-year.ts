export function parseModelYear(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  if (/^(19|20)\d{2}$/.test(raw)) {
    const year = parseInt(raw, 10);
    if (year >= 1950 && year <= 2100) return year;
    return undefined;
  }

  if (/^\d{2}$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n >= 50 ? 1900 + n : 2000 + n;
  }

  const match = raw.match(/\b(19\d{2}|20\d{2})\b/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1950 && year <= 2100) return year;
  }

  return undefined;
}

export type CalcomaniaValue = "0" | "00" | "1" | "2";

export function normalizeCalcomania(
  value: unknown,
): CalcomaniaValue | undefined {
  if (value == null || value === "") return undefined;
  const raw = String(value).trim();
  if (raw === "0" || raw === "00" || raw === "1" || raw === "2") return raw;
  return undefined;
}

function indicatesExemption(raw: string): boolean {
  if (raw.includes("sin restricción") || raw.includes("sin restriccion")) {
    return true;
  }
  if (/\bno\s+exento\b/.test(raw)) return false;
  if (/\bno\s+(?:es|est[aá]?|cumple|aplica)\b[^.]{0,48}\bexento\b/.test(raw)) {
    return false;
  }
  return /\bexento\b/.test(raw);
}

export function parseCalcomaniaFromHolograma(
  value: string | number | null | undefined,
): CalcomaniaValue | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;

  if (raw === "00" || raw.includes("doble cero") || raw.includes("doble-cero")) {
    return "00";
  }

  if (
    raw === "2" ||
    raw.includes("holograma 2") ||
    raw.includes("tipo 2") ||
    /holograma\s*[:.]?\s*2\b/.test(raw) ||
    /\bengomado\s*2\b/.test(raw) ||
    /\bcalcoman[ií]a\s*2\b/.test(raw)
  ) {
    return "2";
  }
  if (
    raw === "1" ||
    raw.includes("holograma 1") ||
    raw.includes("tipo 1") ||
    /holograma\s*[:.]?\s*1\b/.test(raw) ||
    /\bengomado\s*1\b/.test(raw) ||
    /\bcalcoman[ií]a\s*1\b/.test(raw)
  ) {
    return "1";
  }

  if (raw === "0" || (/^0\b/.test(raw) && !raw.startsWith("00"))) return "0";
  if (/^2\b/.test(raw) || /^2\s*[-–]/.test(raw)) return "2";
  if (/^1\b/.test(raw) || /^1\s*[-–]/.test(raw)) return "1";
  if (indicatesExemption(raw)) return "0";

  const digit = raw.replace(/\D/g, "");
  if (digit === "00") return "00";
  if (digit === "0") return "0";
  if (digit === "1") return "1";
  if (digit === "2") return "2";

  const trailing = raw.match(/(?:holograma|engomado|calcoman[ií]a)\s*[:.]?\s*([012])\b/);
  if (trailing?.[1] === "2") return "2";
  if (trailing?.[1] === "1") return "1";
  if (trailing?.[1] === "0") return "0";

  return undefined;
}

export function resolveCalcomaniaFromVerificacionFields(
  fields: Record<string, string | number | null | undefined>,
): CalcomaniaValue | undefined {
  const prioritized = [fields.holograma, fields.resultado];
  let zeroCandidate: CalcomaniaValue | undefined;

  for (const value of prioritized) {
    const parsed = parseCalcomaniaFromHolograma(value);
    if (!parsed) continue;
    if (parsed === "1" || parsed === "2" || parsed === "00") return parsed;
    zeroCandidate = "0";
  }

  for (const value of Object.values(fields)) {
    const parsed = parseCalcomaniaFromHolograma(value);
    if (parsed === "1" || parsed === "2" || parsed === "00") return parsed;
  }

  return zeroCandidate;
}
