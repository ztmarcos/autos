/**
 * Genera un HTML de vista previa del correo de bienvenida.
 * Uso: node scripts/preview-welcome-email.cjs
 */
const fs = require("fs");
const path = require("path");

const { buildWelcomeEmail } = require("../lib/email-templates");

const { html } = buildWelcomeEmail("Marcos");
const outPath = path.join(__dirname, "../preview-welcome-email.html");
fs.writeFileSync(outPath, html);
console.log(`Vista previa: ${outPath}`);
