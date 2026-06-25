/**
 * Envía un correo de bienvenida de prueba.
 * Uso: node scripts/send-welcome-email.cjs [email] [nombre] [userId] [cc]
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const admin = require("firebase-admin");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key] || key.toLowerCase().includes("gmail")) {
      process.env[key] = value;
    }
  }
}

loadEnv(path.join(__dirname, "../.env"));

const to = process.argv[2] || "z.t.marcos@gmail.com";
const displayName = process.argv[3] || "";
const userIdArg = process.argv[4];
const cc = process.argv[5] || "";
const account = process.env.GMAIL_ACCOUNT || process.env.gmail_account;
const password = (process.env.GMAIL_PASSWORD || process.env.gmail_password || "").replace(
  /\s+/g,
  "",
);

if (!account || !password) {
  console.error("Faltan GMAIL_ACCOUNT y GMAIL_PASSWORD en functions/.env");
  process.exit(1);
}

async function findUserByEmail(db, email) {
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function loadVehicles(db, email, userIdArg) {
  const knownUserIds = {
    "z.t.marcos@gmail.com": "R4rQxOx7sJex2hE8LVtAX09cxci2",
    "casinseguros@gmail.com": "7e965827a55cc2f07aecdc095491",
  };
  const userId = userIdArg || knownUserIds[email];
  if (!userId) return [];

  try {
    const { listVehiclesForUser } = require("../lib/mail-user");
    return await listVehiclesForUser(db, userId);
  } catch {
    return loadVehiclesViaRest(userId);
  }
}

function firestoreValueToJs(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  return undefined;
}

async function loadVehiclesViaRest(userId) {
  try {
    const token = execSync("gcloud auth print-access-token", {
      encoding: "utf8",
    }).trim();
    const response = await fetch(
      "https://firestore.googleapis.com/v1/projects/autos-fa58f/databases/(default)/documents:runQuery",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "vehicles" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "userId" },
                op: "EQUAL",
                value: { stringValue: userId },
              },
            },
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Firestore REST ${response.status}`);
    }
    const rows = await response.json();
    const { vehicleFromFirestore } = require("../lib/vehicle-email");
    return rows
      .filter((row) => row.document?.fields)
      .map((row) => {
        const fields = row.document.fields;
        const data = Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [
            key,
            firestoreValueToJs(value),
          ]),
        );
        return vehicleFromFirestore(data);
      });
  } catch (error) {
    console.warn(
      "No se pudieron cargar autos desde Firestore:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "autos-fa58f" });
  }
  const db = admin.firestore();
  const { configureMail, sendWelcomeEmail } = require("../lib/mail");

  configureMail(account, password);

  let user = null;
  try {
    user = await findUserByEmail(db, to);
  } catch {
    // Sin credenciales de Firestore: seguimos con nombre manual.
  }

  const vehicles = await loadVehicles(db, to, user?.id || userIdArg);
  const name = displayName || user?.displayName;

  await sendWelcomeEmail(to, name, vehicles, cc ? { cc } : undefined);
  console.log(
    `Correo de bienvenida enviado a ${to}` +
      (cc ? ` (cc: ${cc})` : "") +
      (vehicles.length ? ` (${vehicles.length} auto(s))` : " (sin autos)"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
