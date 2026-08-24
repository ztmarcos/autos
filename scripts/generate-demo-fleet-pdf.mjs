#!/usr/bin/env node
/**
 * Genera PDF resumen de la flota demo: filas = campos, columnas = autos.
 * Run: npm run demo:fleet-pdf
 */
import { readFileSync, mkdirSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(__dirname, "demo-fleet-data.json"), "utf8"),
);
const vehicles = data.vehicles;

const ROWS = [
  { label: "Placa", key: "plate" },
  { label: "Estado", key: "state" },
  { label: "Marca", key: "brand" },
  { label: "Año", key: "modelYear" },
  { label: "NIV / VIN", key: "niv" },
  { label: "Cilindros", key: "cylinders" },
  {
    label: "Km actual",
    key: "currentKm",
    format: (v) => `${Number(v).toLocaleString("es-MX")} km`,
  },
  {
    label: "Holograma",
    key: "calcomania",
    format: (v) => `Holograma ${v}`,
  },
  { label: "Verificación", key: "verificationDate" },
  { label: "Tenencia", key: "tenenciaDate" },
  { label: "Último servicio", key: "serviceDate" },
  {
    label: "Km servicio",
    key: "serviceKm",
    format: (v) => `${Number(v).toLocaleString("es-MX")} km`,
  },
  { label: "Póliza vence", key: "insuranceExpiryDate" },
  { label: "No. póliza", key: "no_poliza" },
  { label: "Asegurado", key: "nombre_asegurado", rowH: 36 },
  { label: "Cobertura", key: "cobertura" },
  { label: "Aseguradora", value: () => data.aseguradora },
];

const OUT_DIR = join(__dirname, "output");
mkdirSync(OUT_DIR, { recursive: true });
const OUT_PATH = join(OUT_DIR, "demo-fleet-summary.pdf");

const pageW = 842;
const pageH = 595;
const margin = 28;
const labelColW = 108;
const tableW = pageW - margin * 2;
const dataColW = (tableW - labelColW) / vehicles.length;
const headerH = 54;
const defaultRowH = 24;

function drawCell(doc, text, x, y, w, h, opts = {}) {
  const {
    bold = false,
    fill = "#ffffff",
    color = "#111111",
    fontSize = 7,
  } = opts;

  doc.save();
  doc.rect(x, y, w, h).fill(fill);
  doc
    .fillColor(color)
    .font(bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(fontSize);
  doc.text(String(text ?? "—"), x + 4, y + 4, {
    width: w - 8,
    height: h - 6,
    lineGap: -1,
  });
  doc.restore();
  doc.strokeColor("#cccccc").lineWidth(0.5).rect(x, y, w, h).stroke();
}

const doc = new PDFDocument({
  size: [pageW, pageH],
  margins: { top: margin, bottom: margin, left: margin, right: margin },
  info: {
    Title: "autoControl — Flota demo",
    Author: "autoControl",
  },
});

const out = createWriteStream(OUT_PATH);
doc.pipe(out);

let y = margin;

doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000");
doc.text("autoControl — Resumen flota demo", margin, y);
y += 18;
doc.font("Helvetica").fontSize(9).fillColor("#555555");
doc.text(
  `${vehicles.length} vehículos · CDMX · ${new Date().toLocaleDateString("es-MX")}`,
  margin,
  y,
);
y += 22;

let x = margin;
drawCell(doc, "", x, y, labelColW, headerH, {
  fill: "#f0f0f0",
  bold: true,
});
x += labelColW;
for (const vehicle of vehicles) {
  drawCell(doc, vehicle.alias, x, y, dataColW, headerH, {
    fill: "#111111",
    color: "#ffffff",
    bold: true,
    fontSize: 6.5,
  });
  x += dataColW;
}
y += headerH;

for (let i = 0; i < ROWS.length; i++) {
  const row = ROWS[i];
  const rowH = row.rowH ?? defaultRowH;
  const alt = i % 2 === 0;
  const fill = alt ? "#f8f8f8" : "#ffffff";

  if (y + rowH > pageH - margin) {
    doc.addPage({
      size: [pageW, pageH],
      margins: { top: margin, bottom: margin, left: margin, right: margin },
    });
    y = margin;
  }

  x = margin;
  drawCell(doc, row.label, x, y, labelColW, rowH, {
    fill,
    bold: true,
    fontSize: 7,
  });
  x += labelColW;

  for (const vehicle of vehicles) {
    const raw = row.value ? row.value(vehicle) : vehicle[row.key];
    const text = row.format ? row.format(raw, vehicle) : raw;
    drawCell(doc, text, x, y, dataColW, rowH, { fill, fontSize: 6.5 });
    x += dataColW;
  }

  y += rowH;
}

doc.end();

out.on("finish", () => {
  console.log(`PDF generado: ${OUT_PATH}`);
});
