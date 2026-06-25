/**
 * One-off: fetch state news for all configured states.
 * Run: node scripts/fetch-state-news-now.cjs (from functions/)
 */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

loadEnv();

admin.initializeApp({ projectId: "autos-fa58f" });

const { fetchAllStateNews } = require("../lib/fetch-state-news");

fetchAllStateNews(admin.firestore())
  .then((results) => {
    for (const result of results) {
      console.log(
        `${result.stateCode}: changed=${result.changed} alerts=${result.alertsCount} ai=${result.usedAi}`,
      );
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
