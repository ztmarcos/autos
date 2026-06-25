export type VehicleNewsCategory =
  | "no_circula"
  | "placas"
  | "verificacion"
  | "tenencia"
  | "general";

export interface StateNewsAlert {
  id: string;
  title: string;
  summary: string;
  category: VehicleNewsCategory;
  stateCodes: string[];
  plateDigits?: string[];
  /** Hologramas/calcomanías afectados (p. ej. ["1","2"] en contingencia). */
  affectedHolograms?: string[];
  sourceUrl: string;
  publishedAt: string;
  severity: "info" | "warning" | "urgent";
}

export interface RssItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export interface StateNewsSource {
  stateCode: string;
  stateName: string;
  rssUrl: string;
  officialUrl: string;
}

export const STATE_NEWS_SOURCES: StateNewsSource[] = [
  {
    stateCode: "CDMX",
    stateName: "Ciudad de México",
    rssUrl:
      "https://news.google.com/rss/search?q=hoy+no+circula+CDMX+OR+contingencia+ambiental+CDMX&hl=es-419&gl=MX&ceid=MX:es-419",
    officialUrl: "https://www.semovi.cdmx.gob.mx/",
  },
  {
    stateCode: "EDOMEX",
    stateName: "Estado de México",
    rssUrl:
      "https://news.google.com/rss/search?q=hoy+no+circula+Estado+de+M%C3%A9xico+veh%C3%ADculos&hl=es-419&gl=MX&ceid=MX:es-419",
    officialUrl: "https://tenencia.edomex.gob.mx/",
  },
  {
    stateCode: "JAL",
    stateName: "Jalisco",
    rssUrl:
      "https://news.google.com/rss/search?q=verificaci%C3%B3n+vehicular+Jalisco+placas&hl=es-419&gl=MX&ceid=MX:es-419",
    officialUrl: "https://www.jalisco.gob.mx/",
  },
  {
    stateCode: "NL",
    stateName: "Nuevo León",
    rssUrl:
      "https://news.google.com/rss/search?q=verificaci%C3%B3n+vehicular+Nuevo+Le%C3%B3n&hl=es-419&gl=MX&ceid=MX:es-419",
    officialUrl: "https://www.nl.gob.mx/",
  },
  {
    stateCode: "PUE",
    stateName: "Puebla",
    rssUrl:
      "https://news.google.com/rss/search?q=verificaci%C3%B3n+vehicular+Puebla+tenencia&hl=es-419&gl=MX&ceid=MX:es-419",
    officialUrl: "https://www.puebla.gob.mx/",
  },
];

const RELEVANT_KEYWORDS = [
  "no circula",
  "hoy no circula",
  "contingencia",
  "verificaci",
  "tenencia",
  "refrendo",
  "placa",
  "placas",
  "reemplac",
  "vehicular",
  "semovi",
  "calcoman",
  "holograma",
];

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks) {
    const title = decodeXml(extractTag(block, "title"));
    const link = decodeXml(extractTag(block, "link"));
    const pubDate = decodeXml(extractTag(block, "pubDate"));
    const description = decodeXml(
      extractTag(block, "description") || extractTag(block, "content:encoded"),
    );
    const guid = decodeXml(extractTag(block, "guid")) || link || title;

    if (!title || !guid) continue;

    items.push({
      id: guid,
      title,
      link: link || "",
      pubDate: pubDate || new Date().toISOString(),
      description,
    });
  }

  return items;
}

function extractTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterRelevantRssItems(items: RssItem[]): RssItem[] {
  return items.filter((item) => {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    return RELEVANT_KEYWORDS.some((keyword) => haystack.includes(keyword));
  });
}

export function hashContent(value: string): string {
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}
