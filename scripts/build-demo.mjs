#!/usr/bin/env node
/**
 * Build estático para el sitio demo (hosting separado en Firebase).
 * Salida: out-demo/
 */
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

const env = {
  ...process.env,
  NEXT_PUBLIC_DEMO_HOSTING: "true",
  NEXT_PUBLIC_DEMO_PASSWORD: "mz321",
};

console.log("Building demo hosting (password gate, demo user only)…");
execSync("npx next build", { stdio: "inherit", env });

rmSync("out-demo", { recursive: true, force: true });
cpSync("out", "out-demo", { recursive: true });
console.log("Demo build copied to out-demo/");
