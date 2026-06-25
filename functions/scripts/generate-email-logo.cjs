/**
 * Genera logo-email.png con fondo blanco para correos.
 * Uso: node functions/scripts/generate-email-logo.cjs
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const padding = 20;
const srcPath = path.join(__dirname, "../../public/logo.png");
const outPaths = [
  path.join(__dirname, "../../public/logo-email.png"),
  path.join(__dirname, "../assets/logo-email.png"),
];

function blendPixel(bg, fg, alpha) {
  const a = alpha / 255;
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
    255,
  ];
}

function main() {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const out = new PNG({
    width: src.width + padding * 2,
    height: src.height + padding * 2,
  });

  const white = [255, 255, 255, 255];

  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const idx = (out.width * y + x) << 2;
      out.data[idx] = 255;
      out.data[idx + 1] = 255;
      out.data[idx + 2] = 255;
      out.data[idx + 3] = 255;
    }
  }

  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) << 2;
      const dstX = x + padding;
      const dstY = y + padding;
      const dstIdx = (out.width * dstY + dstX) << 2;
      const fg = [
        src.data[srcIdx],
        src.data[srcIdx + 1],
        src.data[srcIdx + 2],
        src.data[srcIdx + 3],
      ];
      const blended = blendPixel(white, fg, fg[3]);
      out.data[dstIdx] = blended[0];
      out.data[dstIdx + 1] = blended[1];
      out.data[dstIdx + 2] = blended[2];
      out.data[dstIdx + 3] = blended[3];
    }
  }

  const buffer = PNG.sync.write(out);
  for (const outPath of outPaths) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buffer);
    console.log("Wrote", outPath);
  }
}

main();
