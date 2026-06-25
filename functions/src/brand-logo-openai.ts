import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { PNG } from "pngjs";
import OpenAI from "openai";

const MIN_VISIBLE_LOGO_PIXELS = 800;
const LOGO_ALPHA_THRESHOLD = 128;

let cachedApiKey: string | null = null;

export async function getOpenAiApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  if (process.env.FUNCTIONS_EMULATOR === "true" && process.env.OPENAI_API_KEY?.trim()) {
    cachedApiKey = process.env.OPENAI_API_KEY.trim();
    return cachedApiKey;
  }

  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: "projects/autos-fa58f/secrets/OPENAI_API_KEY/versions/latest",
  });
  const key = version.payload?.data?.toString().trim();
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  cachedApiKey = key;
  return key;
}

function getOpenAI(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export async function resolveBrandFromDescription(
  description: string,
  apiKey: string,
): Promise<{ brand: string; logoBrief: string }> {
  const openai = getOpenAI(apiKey);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Identifica la marca automotriz de una descripción de vehículo mexicana. Responde JSON: { brand: nombre oficial en inglés (ej. Mercedes-Benz, BMW, Volkswagen), logoBrief: descripción geométrica breve del emblema oficial de la marca, sin texto ni autos }.",
      },
      { role: "user", content: description },
    ],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
    brand?: string;
    logoBrief?: string;
  };

  const brand = parsed.brand?.trim() || description.split(/\s+/)[0] || "Automotive";
  return {
    brand,
    logoBrief: parsed.logoBrief?.trim() || `Official ${brand} automotive emblem`,
  };
}

export async function researchBrandLogoBrief(
  brand: string,
  apiKey: string,
): Promise<string | null> {
  const openai = getOpenAI(apiKey);
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: `Busca en internet el logo oficial actual de la marca automotriz ${brand}. Describe solo la forma geométrica icónica del emblema (sin texto, sin autos, sin fondo). Máximo 3 oraciones en inglés, para generar un ícono vectorial.`,
    });
    const text = response.output_text?.trim();
    return text || null;
  } catch (err) {
    console.warn("Brand logo web research failed:", err);
    return null;
  }
}

export function countVisibleLogoPixels(
  pngBuffer: Buffer,
  alphaThreshold = LOGO_ALPHA_THRESHOLD,
): number {
  const png = PNG.sync.read(pngBuffer);
  let count = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] >= alphaThreshold) count++;
  }
  return count;
}

function buildLogoPrompt(brand: string, logoDescription: string, attempt: number): string {
  const base = [
    `Official ${brand} automotive/motorcycle brand emblem logo mark only.`,
    logoDescription,
    "Solid pure black (#000000) shapes with full opacity on transparent background.",
    "No text, no letters, no wordmark, no vehicle silhouette, no background color,",
    "no gradients, no shadows, no border frame.",
    "Centered minimalist high-contrast vector-style icon.",
  ];

  if (attempt === 0) {
    base.push("Accurate official geometry, clearly visible at small sizes.");
  } else {
    base.push(
      "The icon must be bold, thick, and clearly visible — never faint, never invisible, never empty.",
      "Use a simple recognizable geometric emblem shape.",
    );
  }

  return base.join(" ");
}

async function requestLogoImage(openai: OpenAI, prompt: string): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    background: "transparent",
    output_format: "png",
    n: 1,
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image generation returned no data");
  return Buffer.from(b64, "base64");
}

export async function generateBrandLogoPng(
  brand: string,
  logoDescription: string,
  apiKey: string,
): Promise<Buffer> {
  const openai = getOpenAI(apiKey);
  let lastVisiblePixels = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildLogoPrompt(brand, logoDescription, attempt);
    const buffer = await requestLogoImage(openai, prompt);
    const visiblePixels = countVisibleLogoPixels(buffer);
    lastVisiblePixels = visiblePixels;

    if (visiblePixels >= MIN_VISIBLE_LOGO_PIXELS) {
      return buffer;
    }

    console.warn(
      `Brand logo for ${brand} attempt ${attempt + 1} too faint (${visiblePixels} visible pixels)`,
    );
  }

  throw new Error(
    `Generated logo for ${brand} has insufficient visible content (${lastVisiblePixels} pixels)`,
  );
}
