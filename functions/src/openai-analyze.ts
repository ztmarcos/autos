import OpenAI from "openai";
import {
  DOCUMENT_SCHEMAS,
  buildClassificationPrompt,
  DATE_EXTRACTION_RULES,
  type DocumentType,
} from "./document-schemas";

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: key });
}

interface AnalysisResult {
  detectedType: DocumentType;
  detectedTypeLabel: string;
  confidence: number;
  extractedFields: Record<string, string | number | null>;
}

export async function analyzeDocument(
  text: string,
  imageBase64?: string,
  mimeType?: string,
): Promise<AnalysisResult> {
  const openai = getOpenAI();
  const schemaPrompt = buildClassificationPrompt();

  const systemPrompt = `Eres un extractor de documentos vehiculares mexicanos.
Clasifica el documento y extrae SOLO campos relevantes del schema correspondiente.
Responde JSON válido con: detectedType, confidence (0-1), extractedFields (objeto).
Tipos y campos:
${schemaPrompt}
No inventes datos. Usa null si no aparece en el documento.
${DATE_EXTRACTION_RULES}
Para tarjeta_circulacion: extrae marca, submarca, modelo (si aparece), anio (año-modelo en 4 dígitos cuando sea posible), placa, NIV, propietario, tipo_vehiculo (AUTOMÓVIL, MOTOCICLETA, etc.) y fechas de expedición/vencimiento. No uses campos de vigencia ni años duplicados.
Para poliza_seguro: extrae marca, submarca, modelo (nombre comercial, ej. Fit, Jetta), anio (año-modelo), tipo_vehiculo (AUTOMÓVIL, MOTOCICLETA, etc.), vigencia_inicio y vigencia_fin en DD/MM/AAAA. Si modelo trae solo el año, ponlo en anio.
Para verificacion: extrae fecha del comprobante en DD/MM/AAAA, holograma (0, 00, 1 o 2) y resultado tal cual aparece. Usa null en holograma si no se ve claramente; no uses 0 por defecto.
Para tenencia: extrae fecha_pago del comprobante de tenencia o refrendo en DD/MM/AAAA.
Para poliza_seguro teléfonos: extrae TODOS los teléfonos visibles (asistencia vial, emergencias, reporte de siniestros, atención a clientes). Normaliza a dígitos con código de país si aparece (ej. +52 55 1234 5678).`;

  if (imageBase64 && mimeType?.startsWith("image/")) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analiza este documento vehicular mexicano." },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    });
    return parseResponse(response.choices[0]?.message?.content ?? "{}");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Texto del documento:\n\n${text.slice(0, 8000)}`,
      },
    ],
  });

  return parseResponse(response.choices[0]?.message?.content ?? "{}");
}

function parseResponse(raw: string): AnalysisResult {
  const parsed = JSON.parse(raw) as {
    detectedType?: DocumentType;
    confidence?: number;
    extractedFields?: Record<string, string | number | null>;
  };

  const type = parsed.detectedType ?? "otro";
  const schema = DOCUMENT_SCHEMAS[type] ?? DOCUMENT_SCHEMAS.otro;

  const fields: Record<string, string | number | null> = {};
  for (const key of schema.fields) {
    fields[key] = parsed.extractedFields?.[key] ?? null;
  }

  return {
    detectedType: type,
    detectedTypeLabel: schema.label,
    confidence: parsed.confidence ?? 0.5,
    extractedFields: fields,
  };
}
