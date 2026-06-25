/**
 * Sync a small subset from casin autos.json and print test access links.
 * Run: npm run seed:casin-test (from functions/)
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const {
  syncCasinAutosFromPayload,
  buildAccessLinkUrl,
} = require("../lib/casin-autos-sync");

const PROJECT_ID = "autos-fa58f";
const DEFAULT_JSON_PATH = path.resolve(
  __dirname,
  "../../../../Users/marcoszavalatorres/.cursor/projects/Volumes-SSD-carcontrol/uploads/autos-0.json",
);

async function loadAutosPayload(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    let raw = fs.readFileSync(filePath, "utf8");
    if (raw.startsWith("Source URL")) {
      raw = raw.slice(raw.indexOf("{"));
    }
    return JSON.parse(raw);
  }

  const response = await fetch("https://casin-crm.web.app/sync/autos.json");
  if (!response.ok) {
    throw new Error(`No se pudo descargar autos.json (${response.status})`);
  }
  return response.json();
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

async function main() {
  const jsonPath = process.argv[2];
  const full = await loadAutosPayload(jsonPath);
  const withEmail = full.data.filter((auto) => auto.e_mail?.trim());
  const withoutEmail = full.data.filter((auto) => !auto.e_mail?.trim());
  const subset = [...withEmail.slice(0, 2), ...withoutEmail.slice(0, 1)];

  if (subset.length === 0) {
    throw new Error("No hay registros para sincronizar");
  }

  const payload = {
    ...full,
    data: subset,
    count: subset.length,
  };

  console.log(`Syncing ${subset.length} autos de prueba...`);
  const result = await syncCasinAutosFromPayload(db, payload);
  console.log("Sync result:", result);

  const linksSnap = await db.collection("access_links").get();
  const links = linksSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      displayName: data.displayName,
      email: data.email,
      vehicleCount: Array.isArray(data.casinAutoIds) ? data.casinAutoIds.length : 0,
      link: buildAccessLinkUrl(doc.id),
      token: doc.id,
    };
  });

  links.sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

  console.log("\nEnlaces de prueba:\n");
  for (const item of links) {
    console.log(`- ${item.displayName}${item.email ? ` (${item.email})` : ""}`);
    console.log(`  vehículos: ${item.vehicleCount}`);
    console.log(`  ${item.link}\n`);
  }

  if (links.length > 0) {
    console.log("Prueba recomendada:");
    console.log(links[0].link);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
