import type { DocumentType } from "@/lib/types";

export interface DocumentFieldSchema {
  key: string;
  label: string;
}

export interface DocumentTypeSchema {
  type: DocumentType;
  label: string;
  fields: DocumentFieldSchema[];
}

export const DOCUMENT_SCHEMAS: DocumentTypeSchema[] = [
  {
    type: "tarjeta_circulacion",
    label: "Tarjeta de circulación",
    fields: [
      { key: "placa", label: "Placa" },
      { key: "niv", label: "NIV" },
      { key: "marca", label: "Marca" },
      { key: "submarca", label: "Submarca" },
      { key: "modelo", label: "Modelo" },
      { key: "anio", label: "Año" },
      { key: "color", label: "Color" },
      { key: "entidad", label: "Entidad" },
      { key: "nombre", label: "Nombre (propietario)" },
      { key: "cilindros", label: "Cilindros" },
      { key: "tipo_vehiculo", label: "Tipo de vehículo" },
      { key: "fecha_expedicion", label: "Expedición" },
      { key: "fecha_vencimiento", label: "Vencimiento" },
    ],
  },
  {
    type: "poliza_seguro",
    label: "Póliza de seguro",
    fields: [
      { key: "aseguradora", label: "Aseguradora" },
      { key: "no_poliza", label: "No. póliza" },
      { key: "nombre_asegurado", label: "Asegurado" },
      { key: "placa", label: "Placa" },
      { key: "marca", label: "Marca" },
      { key: "submarca", label: "Submarca" },
      { key: "modelo", label: "Modelo" },
      { key: "anio", label: "Año" },
      { key: "tipo_vehiculo", label: "Tipo de vehículo" },
      { key: "vigencia_inicio", label: "Vigencia inicio" },
      { key: "vigencia_fin", label: "Vigencia fin" },
      { key: "cobertura_responsabilidad", label: "Cobertura" },
      { key: "telefono_asistencia", label: "Asistencia vial" },
      { key: "telefono_siniestros", label: "Reporte de siniestros" },
      { key: "telefono_atencion", label: "Atención a clientes" },
    ],
  },
  {
    type: "factura",
    label: "Factura",
    fields: [
      { key: "fecha", label: "Fecha" },
      { key: "monto", label: "Monto" },
      { key: "emisor", label: "Emisor" },
      { key: "vin", label: "VIN" },
      { key: "descripcion", label: "Descripción" },
    ],
  },
  {
    type: "tenencia",
    label: "Tenencia",
    fields: [
      { key: "entidad", label: "Entidad" },
      { key: "ejercicio", label: "Ejercicio" },
      { key: "monto", label: "Monto" },
      { key: "placa", label: "Placa" },
      { key: "fecha_pago", label: "Fecha de pago" },
    ],
  },
  {
    type: "verificacion",
    label: "Verificación",
    fields: [
      { key: "entidad", label: "Entidad" },
      { key: "fecha", label: "Fecha" },
      { key: "resultado", label: "Resultado" },
      { key: "holograma", label: "Holograma" },
      { key: "placa", label: "Placa" },
    ],
  },
  {
    type: "servicio",
    label: "Servicio",
    fields: [
      { key: "taller", label: "Taller" },
      { key: "fecha", label: "Fecha" },
      { key: "km", label: "Kilometraje" },
      { key: "servicios", label: "Servicios" },
      { key: "monto", label: "Monto" },
    ],
  },
  {
    type: "otro",
    label: "Otro documento",
    fields: [
      { key: "titulo_inferido", label: "Título" },
      { key: "fecha", label: "Fecha" },
      { key: "monto", label: "Monto" },
      { key: "notas", label: "Notas" },
    ],
  },
];

export function getSchema(type: DocumentType): DocumentTypeSchema {
  return (
    DOCUMENT_SCHEMAS.find((s) => s.type === type) ??
    DOCUMENT_SCHEMAS[DOCUMENT_SCHEMAS.length - 1]
  );
}

export function getSchemaLabel(type: DocumentType): string {
  return getSchema(type).label;
}

export function buildOpenAISchemaPrompt(): string {
  return DOCUMENT_SCHEMAS.map(
    (s) =>
      `${s.type}: ${s.fields.map((f) => f.key).join(", ")}`,
  ).join("\n");
}
