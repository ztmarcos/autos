#!/usr/bin/env node
/**
 * Build main (out/) + demo (out-demo/) sin pisar el sitio principal.
 */
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";

const demoEnv = {
  ...process.env,
  NEXT_PUBLIC_DEMO_HOSTING: "true",
  NEXT_PUBLIC_DEMO_PASSWORD: "mz321",
};

console.log("Building main hosting…");
execSync("npx next build", { stdio: "inherit" });

console.log("Saving main build…");
rmSync("out-main-tmp", { recursive: true, force: true });
cpSync("out", "out-main-tmp", { recursive: true });

console.log("Building demo hosting…");
execSync("npx next build", { stdio: "inherit", env: demoEnv });

rmSync("out-demo", { recursive: true, force: true });
cpSync("out", "out-demo", { recursive: true });

rmSync("out", { recursive: true, force: true });
cpSync("out-main-tmp", "out", { recursive: true });
rmSync("out-main-tmp", { recursive: true, force: true });

console.log("Done: out/ (main) + out-demo/ (demo)");
