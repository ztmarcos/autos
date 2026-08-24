#!/usr/bin/env node
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "output");
mkdirSync(OUT_DIR, { recursive: true });
const OUT_PATH = join(OUT_DIR, "polizas-pdf-faltantes.pdf");

const ROWS = [
  ["Antonio Humberto Jiménez Perlazca", "P5VT2", "737521088", "BMW R1250RT", "Archivo", "Hay carpeta; las 3 pólizas son GS, Lincoln y Frontier"],
  ["Augusto Sánchez Losada Cordero", "B14AEA", "501954784", "Nissan Versa", "Carpeta", "No hay carpeta en Firedrive"],
  ["Carlos Mauricio Mora Vieyra", "33ARX4", "717206742", "BMW R1250RT", "Carpeta", "No hay carpeta en Firedrive"],
  ["Claudia Georgina Ruiz Gómez", "X81BLY", "725482988", "Nissan Versa", "Archivo", "Hay carpeta; solo vida y hogar"],
  ["Claudia Georgina Ruiz Gómez", "S91BNF", "698783875", "Renault Koleos", "Archivo", "Hay carpeta; solo vida y hogar"],
  ["Contraste Producciones Fotográficas", "325XTE", "901849645", "Fiat 500", "Archivo", "Carpeta S.A. de C.V.; los PDFs son GMM"],
  ["Contraste Producciones Fotográficas", "601ZRC", "401973850", "VW Tiguan", "Archivo", "Carpeta S.A. de C.V.; los PDFs son GMM"],
  ["Covadonga Alejandra Sánchez Pérez", "NKG5355", "3191014713", "Chevy C2", "Carpeta", "No hay carpeta propia (la de Víctor Manuel es Italika)"],
  ["Germán Alberto de la Garza Morales", "NJN104A", "723712378", "Honda City", "Archivo", "Hay carpeta; la póliza es un Corolla"],
  ["Gonzalo Espinosa Zárate", "X41BEV", "723680989", "Honda HR-V", "Archivo", "Hay carpeta; solo daños"],
  ["Hugo Raúl Valverde Dickinson", "36PWG5", "738674522", "BMW R1250GS", "Carpeta", "No hay carpeta en Firedrive"],
  ["Hugo Raúl Valverde Dickinson", "ULW678J", "0005415536", "Suzuki Jimny", "Carpeta", "No hay carpeta en Firedrive"],
  ["Ignacio Maldonado Llobet", "RAF961B", "721395119", "Toyota RAV4", "Archivo", "Carpeta Maldonado Mtz; la póliza es un Civic 2012"],
  ["Irma Saucedo Salinas", "40JSM", "726588833", "Honda CR-V", "Carpeta", "No hay carpeta en Firedrive"],
  ["Jorge Ramón Alcocer Mateos", "16G083", "735751893", "MG MG3", "Carpeta", "No hay carpeta en Firedrive"],
  ["Juan José Medina Siordia", "2 A6081", "110065807", "Zontes E 350", "Archivo", "Hay carpeta; la póliza es un BMW R1200"],
  ["Juan Manuel Asprón Pelayo", "512WLY", "723362992", "Dodge Attitude", "Archivo", "Hay carpeta; solo la Sienna"],
  ["Juan Manuel Asprón Pelayo", "771YMD", "740607627", "Mercedes E 200", "Archivo", "Hay carpeta; solo la Sienna"],
  ["Juan Manuel Asprón Pelayo", "J72BBC", "717203939", "VW Tiguan", "Archivo", "Hay carpeta; solo la Sienna"],
  ["Juan Manuel Asprón Pelayo", "GTX26063000X0A", "005743279", "Tesla Model Y", "Archivo", "Hay carpeta; solo la Sienna"],
  ["Julio Escalante de Icaza", "VNF6N", "725588016", "BMW R1250GS", "Archivo", "Hay carpeta; la póliza es un S1000 XR"],
  ["Kadir Singer Villalpando", "MUS1096", "733244727", "Mazda CX-5", "Carpeta", "No hay carpeta en Firedrive"],
  ["Kadir Singer Villalpando", "27J484", "3191011077", "Ram 1500", "Carpeta", "No hay carpeta en Firedrive"],
  ["María de las Mercedes Bolaños Rodríguez", "UMG002F", "741005912", "Ford EcoSport", "Carpeta", "No hay carpeta en Firedrive"],
  ["Marisol Rivas Calva", "UMC622E", "694430695", "Nissan Versa", "Carpeta", "No hay carpeta propia (en Calva Lozano hay GMM)"],
  ["Martha Patricia Mentado Torres", "LJK331D", "28198665", "Kia Sportage", "Carpeta", "No hay carpeta en Firedrive"],
  ["Miriam Isabel Solís Saucedo", "43BEZ9", "700036924", "BMW R1250GS", "Carpeta", "No hay carpeta en Firedrive"],
  ["Mónica del Carmen García Córdova", "Y19AXG", "742378243", "Nissan March", "Carpeta", "No hay carpeta propia"],
  ["Pakua Techno", "RDD317A", "739365732", "Jetta Clásico", "Carpeta", "No hay carpeta en Firedrive"],
  ["Rafael Contreras Curiel", "572 ZGD", "703721563", "Renault Sandero", "Carpeta", "No hay carpeta en Firedrive"],
  ["Sergio Higuera Bonfil", "PVE758C", "3191017878", "Chevrolet Aveo", "Archivo", "Hay carpeta; la póliza es un Ford Focus"],
  ["Supra Tool S.A. de C.V.", "DAX060640", "0005234850", "Audi Q5", "Archivo", "Hay carpeta; las pólizas son Grand i10 y Accent"],
];

const nCarpeta = ROWS.filter((r) => r[4] === "Carpeta").length;
const nArchivo = ROWS.filter((r) => r[4] === "Archivo").length;

const pageW = 842;
const pageH = 595;
const margin = 28;
const cols = [
  { key: 0, label: "Cliente", w: 168 },
  { key: 1, label: "Placas", w: 78 },
  { key: 2, label: "Póliza", w: 82 },
  { key: 3, label: "Vehículo", w: 108 },
  { key: 4, label: "Falta", w: 58 },
  { key: 5, label: "Detalle en Firedrive", w: 264 },
];
const tableW = cols.reduce((s, c) => s + c.w, 0);
const rowH = 22;
const headerH = 20;

const doc = new PDFDocument({
  size: [pageW, pageH],
  margin: 0,
  info: {
    Title: "Pólizas PDF faltantes — autos vigentes",
    Author: "CASIN / autos",
  },
});
const stream = createWriteStream(OUT_PATH);
doc.pipe(stream);

function drawHeader() {
  doc.rect(0, 0, pageW, 72).fill("#0f172a");
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("Pólizas PDF faltantes", margin, 16, { width: tableW });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#cbd5e1")
    .text(
      "Autos vigentes en la app sin PDF de póliza. Firedrive CASIN. 20 ago 2026.",
      margin,
      36,
      { width: tableW },
    );
  doc
    .fillColor("#f8fafc")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(
      `${ROWS.length} faltantes   ·   ${nCarpeta} sin carpeta   ·   ${nArchivo} con carpeta, sin archivo de este auto   ·   131 ya tienen PDF`,
      margin,
      52,
      { width: tableW },
    );
}

function drawTableHeader(y) {
  let x = margin;
  doc.rect(margin, y, tableW, headerH).fill("#1e293b");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
  for (const col of cols) {
    doc.text(col.label, x + 4, y + 6, { width: col.w - 8 });
    x += col.w;
  }
}

function drawRow(row, y, i) {
  const bg = row[4] === "Carpeta" ? "#fef3c7" : "#e0f2fe";
  const alt = i % 2 === 0 ? bg : (row[4] === "Carpeta" ? "#fde68a" : "#bae6fd");
  doc.rect(margin, y, tableW, rowH).fill(alt);
  let x = margin;
  doc.font("Helvetica").fontSize(7).fillColor("#0f172a");
  for (const col of cols) {
    const value = row[col.key];
    const bold = col.key === 4;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica");
    if (col.key === 4) {
      doc.fillColor(row[4] === "Carpeta" ? "#92400e" : "#075985");
    } else {
      doc.fillColor("#0f172a");
    }
    doc.text(String(value), x + 4, y + 5, {
      width: col.w - 8,
      height: rowH - 6,
      lineBreak: true,
      ellipsis: true,
    });
    x += col.w;
  }
}

drawHeader();
let y = 84;
drawTableHeader(y);
y += headerH;

for (let i = 0; i < ROWS.length; i++) {
  if (y + rowH > pageH - 36) {
    doc.addPage({ size: [pageW, pageH], margin: 0 });
    drawHeader();
    y = 84;
    drawTableHeader(y);
    y += headerH;
  }
  drawRow(ROWS[i], y, i);
  y += rowH;
}

doc
  .font("Helvetica")
  .fontSize(8)
  .fillColor("#64748b")
  .text(
    "Carpeta = no existe folder del cliente. Archivo = sí hay folder, pero no el PDF de póliza/renovación de este auto.",
    margin,
    pageH - 24,
    { width: tableW },
  );

doc.end();
await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});
console.log(OUT_PATH);
