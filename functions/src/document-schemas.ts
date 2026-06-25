export type DocumentType =
  | "tarjeta_circulacion"
  | "poliza_seguro"
  | "factura"
  | "tenencia"
  | "verificacion"
  | "servicio"
  | "otro";

export const DOCUMENT_SCHEMAS: Record<
  DocumentType,
  { label: string; fields: string[] }
> = {
  tarjeta_circulacion: {
    label: "Tarjeta de circulación",
    fields: [
      "placa",
      "niv",
      "marca",
      "submarca",
      "modelo",
      "anio",
      "color",
      "entidad",
      "nombre",
      "cilindros",
      "tipo_vehiculo",
      "fecha_expedicion",
      "fecha_vencimiento",
    ],
  },
  poliza_seguro: {
    label: "Póliza de seguro",
    fields: [
      "aseguradora",
      "no_poliza",
      "nombre_asegurado",
      "placa",
      "marca",
      "submarca",
      "modelo",
      "anio",
      "tipo_vehiculo",
      "vigencia_inicio",
      "vigencia_fin",
      "cobertura_responsabilidad",
      "telefono_asistencia",
      "telefono_siniestros",
      "telefono_atencion",
    ],
  },
  factura: {
    label: "Factura",
    fields: ["fecha", "monto", "emisor", "vin", "descripcion"],
  },
  tenencia: {
    label: "Tenencia",
    fields: ["entidad", "ejercicio", "monto", "placa", "fecha_pago"],
  },
  verificacion: {
    label: "Verificación",
    fields: ["entidad", "fecha", "resultado", "holograma", "placa"],
  },
  servicio: {
    label: "Servicio",
    fields: ["taller", "fecha", "km", "servicios", "monto"],
  },
  otro: {
    label: "Otro documento",
    fields: ["titulo_inferido", "fecha", "monto", "notas"],
  },
};

/** Instrucciones compartidas para fechas extraídas por OpenAI. */
export const DATE_EXTRACTION_RULES = `FECHAS: normaliza siempre a formato numérico DD/MM/AAAA (día/mes/año con barras, mes en 2 dígitos, año en 4 dígitos). Ejemplo: "15/04/2026".
No incluyas hora. No uses nombres de mes (abr, abril, etc.). Si el documento trae "15 abr 2026" o "15/04/2026 12:00", responde solo "15/04/2026".
Si solo hay año sin día/mes, copia solo ese año.`;

export function buildClassificationPrompt(): string {
  return Object.entries(DOCUMENT_SCHEMAS)
    .map(([type, s]) => `${type} (${s.label}): ${s.fields.join(", ")}`)
    .join("\n");
}
