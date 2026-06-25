import OpenAI from "openai";
import { DOCUMENT_SCHEMAS, DATE_EXTRACTION_RULES } from "./document-schemas";

const CARD_FIELDS = DOCUMENT_SCHEMAS.tarjeta_circulacion.fields;

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: key });
}

const SYSTEM_PROMPT = `Eres un extractor de tarjetas de circulación vehicular mexicanas.
Extrae SOLO estos campos en extractedFields (usa null si no aparece):
${CARD_FIELDS.join(", ")}
- niv: número de serie / VIN (17 caracteres si aparece completo)
- nombre: nombre del propietario tal como aparece en la tarjeta
- cilindros: número entero de cilindros del motor
- submarca: versión o línea del vehículo (ej. Fit, Jetta)
- modelo: nombre comercial si aparece impreso (puede coincidir con submarca)
- anio: año-modelo del vehículo (4 dígitos cuando sea posible; si solo hay 2 dígitos, cópialos)
- tipo_vehiculo: tipo de vehículo tal como aparece (ej. AUTOMÓVIL, MOTOCICLETA, CAMIONETA)

FECHAS (solo estas dos, ninguna otra):
- fecha_expedicion: fecha de EXPEDICIÓN / EMISIÓN
- fecha_vencimiento: fecha de VENCIMIENTO / VIGENTE HASTA
${DATE_EXTRACTION_RULES}
No inventes fechas. No agregues campos extra de vigencia ni años sueltos.
Si la tarjeta solo muestra años sin día/mes, copia solo ese año en el campo que corresponda.
NO uses vigencia_anio_inicio, vigencia_anio_fin ni campos duplicados.

Responde JSON: { "confidence": 0-1, "extractedFields": { ... } }
No inventes datos. Normaliza placa en mayúsculas sin espacios extra.`;

export async function analyzeVehicleCard(
  text: string,
  fileBase64?: string,
  mimeType?: string,
): Promise<{
  confidence: number;
  extractedFields: Record<string, string | number | null>;
}> {
  const openai = getOpenAI();
  const useVision =
    fileBase64 &&
    (mimeType?.startsWith("image/") || mimeType === "application/pdf");

  if (useVision && fileBase64 && mimeType) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extrae los datos de esta tarjeta de circulación mexicana. Solo dos fechas: expedición y vencimiento, tal cual aparecen.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${fileBase64}`,
              },
            },
          ],
        },
      ],
    });
    return parseCardResponse(response.choices[0]?.message?.content ?? "{}");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Texto de la tarjeta de circulación (solo expedición y vencimiento tal cual):\n\n${text.slice(0, 8000)}`,
      },
    ],
  });

  return parseCardResponse(response.choices[0]?.message?.content ?? "{}");
}

function parseCardResponse(raw: string): {
  confidence: number;
  extractedFields: Record<string, string | number | null>;
} {
  const parsed = JSON.parse(raw) as {
    confidence?: number;
    extractedFields?: Record<string, string | number | null>;
  };

  const fields: Record<string, string | number | null> = {};
  for (const key of CARD_FIELDS) {
    fields[key] = parsed.extractedFields?.[key] ?? null;
  }

  return {
    confidence: parsed.confidence ?? 0.5,
    extractedFields: fields,
  };
}
