import OpenAI from "openai";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import type { Firestore } from "firebase-admin/firestore";
import {
  STATE_NEWS_SOURCES,
  filterRelevantRssItems,
  hashContent,
  parseRssItems,
  type RssItem,
  type StateNewsAlert,
} from "./state-news-sources";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; autoControl/1.0; +https://autos-fa58f.web.app)",
  Accept: "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "es-MX,es;q=0.9",
};

let cachedApiKey: string | null = null;

async function getOpenAiApiKey(): Promise<string | null> {
  if (cachedApiKey) return cachedApiKey;

  if (process.env.FUNCTIONS_EMULATOR === "true" && process.env.OPENAI_API_KEY?.trim()) {
    cachedApiKey = process.env.OPENAI_API_KEY.trim();
    return cachedApiKey;
  }

  try {
    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({
      name: "projects/autos-fa58f/secrets/OPENAI_API_KEY/versions/latest",
    });
    const key = version.payload?.data?.toString().trim();
    if (!key) return null;
    cachedApiKey = key;
    return key;
  } catch (error) {
    console.error("Failed to load OPENAI_API_KEY from Secret Manager:", error);
    return null;
  }
}

async function fetchRss(url: string, attempt = 1): Promise<RssItem[]> {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    if (attempt < 3 && (response.status === 503 || response.status === 429)) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
      return fetchRss(url, attempt + 1);
    }
    throw new Error(`RSS fetch failed (${response.status}) for ${url}`);
  }
  const xml = await response.text();
  return parseRssItems(xml);
}

function buildAlertId(stateCode: string, itemId: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  return crypto
    .createHash("sha256")
    .update(`${stateCode}:${itemId}`)
    .digest("hex")
    .slice(0, 20);
}

function sanitizeAlertForFirestore(alert: StateNewsAlert): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: alert.id,
    title: alert.title,
    summary: alert.summary,
    category: alert.category,
    stateCodes: alert.stateCodes,
    sourceUrl: alert.sourceUrl,
    publishedAt: alert.publishedAt,
    severity: alert.severity,
  };
  if (alert.plateDigits?.length) {
    data.plateDigits = alert.plateDigits;
  }
  if (alert.affectedHolograms?.length) {
    data.affectedHolograms = alert.affectedHolograms;
  }
  return data;
}

function inferCategory(title: string, description: string): StateNewsAlert["category"] {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("no circula") || text.includes("contingencia")) return "no_circula";
  if (text.includes("placa")) return "placas";
  if (text.includes("verific")) return "verificacion";
  if (text.includes("tenencia") || text.includes("refrendo")) return "tenencia";
  return "general";
}

function rssItemsToBasicAlerts(
  stateCode: string,
  items: RssItem[],
): StateNewsAlert[] {
  return items.map((item, index) => ({
    id: buildAlertId(stateCode, item.id || `${item.title}-${index}`),
    title: item.title,
    summary: item.description.slice(0, 220) || item.title,
    category: inferCategory(item.title, item.description),
    stateCodes: [stateCode],
    sourceUrl: item.link,
    publishedAt: item.pubDate || new Date().toISOString(),
    severity: inferCategory(item.title, item.description) === "no_circula"
      ? "warning"
      : "info",
  }));
}

async function summarizeNewItems(
  stateCode: string,
  stateName: string,
  items: RssItem[],
): Promise<{ alerts: StateNewsAlert[]; usedAi: boolean }> {
  if (items.length === 0) return { alerts: [], usedAi: false };

  const apiKey = await getOpenAiApiKey();
  if (!apiKey) {
    return { alerts: rssItemsToBasicAlerts(stateCode, items), usedAi: false };
  }

  const openai = new OpenAI({ apiKey });
  const payload = items.slice(0, 8).map((item) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    description: item.description.slice(0, 400),
  }));

  let response;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Eres un asistente que resume noticias vehiculares en México para dueños de autos.
Solo incluye noticias relevantes para conductores: hoy no circula, contingencia ambiental, cambio de placas, verificación, tenencia/refrendo.
Ignora noticias de accidentes, delitos o política general sin impacto vehicular directo.
Responde JSON: { "alerts": [ { "title", "summary", "category", "plateDigits", "affectedHolograms", "severity", "sourceUrl", "publishedAt" } ] }
category: no_circula | placas | verificacion | tenencia | general
severity: info | warning | urgent
plateDigits: array de dígitos 0-9 si aplica solo a ciertas terminaciones de placa, o null si aplica a todos.
affectedHolograms: array con "1" y/o "2" si la restricción aplica solo a esos hologramas/calcomanías. En contingencia ambiental CDMX casi siempre es ["1","2"]; calcomanía 0 y 00 quedan exentas. null si no aplica o no se menciona.
En contingencia y hoy no circula, el summary DEBE decir explícitamente qué hologramas aplican y que calcomanía 0/00 está exenta cuando corresponda.
publishedAt en ISO 8601.`,
        },
        {
          role: "user",
          content: `Estado: ${stateName} (${stateCode})\nNoticias:\n${JSON.stringify(payload)}`,
        },
      ],
      temperature: 0.2,
    });
  } catch (error) {
    console.error(`AI summary failed for ${stateCode}:`, error);
    return { alerts: rssItemsToBasicAlerts(stateCode, items), usedAi: false };
  }

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    return { alerts: rssItemsToBasicAlerts(stateCode, items), usedAi: false };
  }

  let parsed: {
    alerts?: Array<{
      title?: string;
      summary?: string;
      category?: StateNewsAlert["category"];
      plateDigits?: string[] | null;
      affectedHolograms?: string[] | null;
      severity?: StateNewsAlert["severity"];
      sourceUrl?: string;
      publishedAt?: string;
    }>;
  };

  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Failed to parse AI news summary:", raw);
    return { alerts: rssItemsToBasicAlerts(stateCode, items), usedAi: false };
  }

  const alerts = (parsed.alerts ?? [])
    .filter((alert) => alert.title && alert.summary)
    .map((alert, index) => ({
      id: buildAlertId(stateCode, `${alert.title}-${index}`),
      title: alert.title!,
      summary: alert.summary!,
      category: alert.category ?? "general",
      stateCodes: [stateCode],
      plateDigits: alert.plateDigits?.filter(Boolean) ?? undefined,
      affectedHolograms: alert.affectedHolograms?.filter(Boolean) ?? undefined,
      sourceUrl: alert.sourceUrl || items[0]?.link || "",
      publishedAt: alert.publishedAt || new Date().toISOString(),
      severity: alert.severity ?? "info",
    }));

  if (alerts.length === 0) {
    return { alerts: rssItemsToBasicAlerts(stateCode, items), usedAi: false };
  }

  return { alerts, usedAi: true };
}

export interface FetchStateNewsResult {
  stateCode: string;
  changed: boolean;
  alertsCount: number;
  usedAi: boolean;
  newAlerts: StateNewsAlert[];
}

export async function fetchAndStoreStateNews(
  db: Firestore,
  stateCode: string,
  options?: { forceAi?: boolean },
): Promise<FetchStateNewsResult> {
  const source = STATE_NEWS_SOURCES.find((entry) => entry.stateCode === stateCode);
  if (!source) {
    throw new Error(`Unknown state code: ${stateCode}`);
  }

  const docRef = db.collection("mx_state_news").doc(stateCode);
  const existingSnap = await docRef.get();
  const existing = existingSnap.data();
  const previousHash = (existing?.contentHash as string) ?? "";
  const previousItemIds = new Set<string>(
    (existing?.sourceItemIds as string[]) ?? [],
  );

  const rssItems = await fetchRss(source.rssUrl);
  const relevant = filterRelevantRssItems(rssItems).slice(0, 12);
  const contentHash = hashContent(
    relevant.map((item) => `${item.id}|${item.title}|${item.pubDate}`).join("\n"),
  );

  const newItems = relevant.filter((item) => !previousItemIds.has(item.id));
  const hashChanged = contentHash !== previousHash;
  const shouldSummarize =
    Boolean(options?.forceAi) || hashChanged || newItems.length > 0;

  const previousAlertIds = new Set(
    ((existing?.alerts as StateNewsAlert[]) ?? []).map((alert) => alert.id),
  );

  let alerts = (existing?.alerts as StateNewsAlert[]) ?? [];
  let usedAi = false;
  let freshAlerts: StateNewsAlert[] = [];

  if (shouldSummarize && relevant.length > 0) {
    const itemsForAi = newItems.length > 0 ? newItems : relevant.slice(0, 5);
    const summarized = await summarizeNewItems(
      source.stateCode,
      source.stateName,
      itemsForAi,
    );
    freshAlerts = summarized.alerts;
    usedAi = summarized.usedAi;

    const merged = new Map<string, StateNewsAlert>();
    for (const alert of alerts) merged.set(alert.id, alert);
    for (const alert of freshAlerts) merged.set(alert.id, alert);

    alerts = [...merged.values()]
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )
      .slice(0, 20);
  }

  const newAlerts = alerts.filter((alert) => !previousAlertIds.has(alert.id));

  await docRef.set(
    {
      stateCode: source.stateCode,
      stateName: source.stateName,
      officialUrl: source.officialUrl,
      lastFetchedAt: new Date().toISOString(),
      contentHash,
      sourceItemIds: relevant.map((item) => item.id),
      alerts: alerts.map(sanitizeAlertForFirestore),
    },
    { merge: true },
  );

  return {
    stateCode,
    changed: hashChanged || newItems.length > 0,
    alertsCount: alerts.length,
    usedAi,
    newAlerts,
  };
}

export async function fetchAllStateNews(
  db: Firestore,
): Promise<FetchStateNewsResult[]> {
  const results: FetchStateNewsResult[] = [];

  for (const source of STATE_NEWS_SOURCES) {
    try {
      const result = await fetchAndStoreStateNews(db, source.stateCode);
      results.push(result);
    } catch (error) {
      console.error(`State news fetch failed for ${source.stateCode}:`, error);
    }
  }

  return results;
}
