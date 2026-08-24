/**
 * Copy vigente auto policy PDFs from CASIN Firedrive into each vehicle.
 * Uses gcloud user credentials (no ADC required).
 * Run from functions/: node scripts/copy-casin-poliza-pdfs.cjs
 */
const { execSync } = require("child_process");
const {
  AUTOS_STORAGE_BUCKET,
  CASIN_DRIVE_BUCKET,
  CASIN_DRIVE_TEAM_ID,
  CASIN_POLIZA_DOC_ID,
  CasinPolizaPdfIndex,
  casinPolizaPdfStoragePath,
  filenamePolicyNumbers,
  scorePolizaPdf,
} = require("../lib/casin-poliza-pdf");
const {
  dedupeCasinAutos,
  filterVigenteCasinAutos,
} = require("../lib/casin-autos-map");

const PROJECT = "autos-fa58f";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;

function accessToken() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

async function firestoreFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${FIRESTORE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Firestore ${res.status} ${url}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : {};
}

function stringField(fields, key) {
  const value = fields?.[key];
  return typeof value?.stringValue === "string" ? value.stringValue : "";
}

function buildPdfIndex(listing) {
  const byNumber = new Map();
  const prefix = `gs://${CASIN_DRIVE_BUCKET}/teams/${CASIN_DRIVE_TEAM_ID}/`;
  for (const line of listing.split("\n")) {
    const trimmed = line.trim();
    const gsIndex = trimmed.indexOf("gs://");
    if (gsIndex < 0) continue;
    const uri = trimmed.slice(gsIndex).trim();
    if (!uri.toLowerCase().endsWith(".pdf")) continue;
    if (!uri.startsWith(prefix)) continue;

    const relative = uri.slice(prefix.length);
    const name = relative.split("/").pop() || "";
    if (!name || name.startsWith(".")) continue;
    const folder = relative.includes("/")
      ? relative.slice(0, relative.lastIndexOf("/"))
      : "(root)";
    const fullPath = `teams/${CASIN_DRIVE_TEAM_ID}/${relative}`;
    const updatedPart = trimmed.slice(0, gsIndex).trim().split(/\s+/)[1];
    const updated = updatedPart ? Date.parse(updatedPart) || 0 : 0;
    const pdf = {
      name,
      fullPath,
      folder,
      updated,
      score: scorePolizaPdf(name, folder),
    };
    for (const num of filenamePolicyNumbers(name)) {
      const list = byNumber.get(num) ?? [];
      list.push(pdf);
      byNumber.set(num, list);
    }
  }
  return new CasinPolizaPdfIndex(byNumber);
}

async function listVehicles() {
  const vehicles = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ pageSize: "300" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await firestoreFetch(`/documents/vehicles?${params}`);
    vehicles.push(...(data.documents || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return vehicles;
}

function copyObject(sourcePath, destPath) {
  const src = `gs://${CASIN_DRIVE_BUCKET}/${sourcePath}`;
  const dest = `gs://${AUTOS_STORAGE_BUCKET}/${destPath}`;
  execSync(`gcloud storage cp --quiet ${JSON.stringify(src)} ${JSON.stringify(dest)}`, {
    stdio: "inherit",
  });
  execSync(
    `gcloud storage objects update --content-type=application/pdf ${JSON.stringify(dest)}`,
    { stdio: "inherit" },
  );
}

async function patchPolizaDoc(vehicleId, fields) {
  const mask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  await firestoreFetch(
    `/documents/vehicles/${vehicleId}/documents/${CASIN_POLIZA_DOC_ID}?${mask}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(fields).map(([key, value]) => {
            if (typeof value === "boolean") return [key, { booleanValue: value }];
            return [key, { stringValue: value }];
          }),
        ),
      }),
    },
  );
}

async function main() {
  console.log("Listing Firedrive PDFs…");
  const listing = execSync(
    `gcloud storage ls -l -r "gs://${CASIN_DRIVE_BUCKET}/teams/${CASIN_DRIVE_TEAM_ID}/**"`,
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const index = buildPdfIndex(listing);

  console.log("Fetching autos.json…");
  const payload = await fetch("https://casin-crm.web.app/sync/autos.json").then(
    (res) => {
      if (!res.ok) throw new Error(`autos.json ${res.status}`);
      return res.json();
    },
  );
  const vigentes = dedupeCasinAutos(filterVigenteCasinAutos(payload.data));
  const byId = new Map(vigentes.map((auto) => [auto.id, auto]));
  console.log(`Vigentes en CRM: ${vigentes.length}`);

  const vehicles = await listVehicles();
  const stats = { copied: 0, unchanged: 0, missing: 0, error: 0, vehicles: 0 };

  for (const vehicle of vehicles) {
    const id = vehicle.name.split("/").pop();
    const casinAutoId = stringField(vehicle.fields, "casinAutoId");
    const userId = stringField(vehicle.fields, "userId");
    const auto = byId.get(casinAutoId);
    if (!auto || !userId || !id) continue;

    stats.vehicles += 1;
    const pdf = index.findBest(auto.numero_poliza);
    if (!pdf) {
      stats.missing += 1;
      console.log(`missing ${auto.numero_poliza} ${auto.placas} ${id}`);
      continue;
    }

    const destPath = casinPolizaPdfStoragePath(userId, id);
    try {
      await patchPolizaDoc(id, {
        status: "ready",
        storagePath: destPath,
        mimeType: "application/pdf",
        fileName: pdf.name,
        casinPdfSource: pdf.fullPath,
        source: "casin",
        skipFullAnalysis: true,
      });
      copyObject(pdf.fullPath, destPath);
      stats.copied += 1;
      console.log(`copied ${auto.numero_poliza} ${auto.placas} ${pdf.name}`);
    } catch (error) {
      stats.error += 1;
      console.error(`error ${auto.numero_poliza} ${id}:`, error.message || error);
    }
  }

  console.log("done", stats);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
