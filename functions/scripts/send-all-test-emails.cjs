/**
 * Envía un correo de prueba de cada tipo de notificación.
 * Uso: node scripts/send-all-test-emails.cjs [email]
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
const account = process.env.GMAIL_ACCOUNT || process.env.gmail_account;
const password = (process.env.GMAIL_PASSWORD || process.env.gmail_password || "").replace(
  /\s+/g,
  "",
);

if (!account || !password) {
  console.error("Faltan GMAIL_ACCOUNT y GMAIL_PASSWORD en functions/.env");
  process.exit(1);
}

const KNOWN_USER_IDS = {
  "z.t.marcos@gmail.com": "R4rQxOx7sJex2hE8LVtAX09cxci2",
};

function firestoreValueToJs(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  return undefined;
}

async function loadVehiclesViaRest(userId) {
  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
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
  if (!response.ok) throw new Error(`Firestore REST ${response.status}`);
  const rows = await response.json();
  const { vehicleFromFirestore } = require("../lib/vehicle-email");
  return rows
    .filter((row) => row.document?.fields)
    .map((row) => {
      const fields = row.document.fields;
      const data = Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, firestoreValueToJs(value)]),
      );
      return vehicleFromFirestore(data);
    });
}

async function loadUserContext(db, email) {
  let displayName;
  let vehicles = [];

  try {
    const snap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!snap.empty) {
      const user = snap.docs[0];
      displayName = user.data().displayName;
      const { listVehiclesForUser } = require("../lib/mail-user");
      vehicles = await listVehiclesForUser(db, user.id);
    }
  } catch {
    // fallback REST
  }

  if (vehicles.length === 0) {
    const userId = KNOWN_USER_IDS[email];
    if (userId) {
      try {
        vehicles = await loadVehiclesViaRest(userId);
      } catch (error) {
        console.warn("No se pudieron cargar autos:", error.message);
      }
    }
  }

  const vehicle =
    vehicles[0] ?? {
      displayName: "Honda Fit (prueba)",
      plate: "ABC-123-D",
      state: "CDMX",
      stateName: "Ciudad de México",
      brand: "Honda",
      verificationDate: "2026-07-15",
      tenenciaDate: "2026-03-31",
      insuranceExpiryDate: "2026-09-01",
    };

  return { displayName, vehicles, vehicle };
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "autos-fa58f" });
  }

  const db = admin.firestore();
  const { configureMail, sendEmail } = require("../lib/mail");
  const {
    buildWelcomeEmail,
    buildVehicleRegisteredEmail,
    buildAlertEmail,
    buildStateNewsEmail,
  } = require("../lib/email-templates");
  const { APP_NAME } = require("../lib/app-name");

  configureMail(account, password);

  const { displayName, vehicles, vehicle } = await loadUserContext(db, to);

  const sends = [
    {
      label: "Bienvenida",
      subject: `Bienvenido a ${APP_NAME}`,
      content: buildWelcomeEmail(displayName, vehicles),
    },
    {
      label: "Auto registrado",
      subject: `${APP_NAME} — Registrado: ${vehicle.displayName}`,
      content: buildVehicleRegisteredEmail(vehicle),
    },
    {
      label: "Alerta verificación",
      subject: `${APP_NAME}: Verificación en 7 días — ${vehicle.displayName}`,
      content: buildAlertEmail(
        vehicle.displayName,
        "Verificación",
        vehicle.verificationDate || "2026-07-15",
        7,
      ),
    },
    {
      label: "Alerta tenencia",
      subject: `${APP_NAME}: Tenencia vence hoy — ${vehicle.displayName}`,
      content: buildAlertEmail(
        vehicle.displayName,
        "Tenencia",
        vehicle.tenenciaDate || "2026-03-31",
        0,
      ),
    },
    {
      label: "Alerta póliza",
      subject: `${APP_NAME}: Póliza vencida — ${vehicle.displayName}`,
      content: buildAlertEmail(
        vehicle.displayName,
        "Póliza",
        vehicle.insuranceExpiryDate || "2026-01-01",
        -3,
      ),
    },
    {
      label: "Noticia estatal",
      subject: `${APP_NAME}: Contingencia ambiental en CDMX`,
      content: buildStateNewsEmail(
        {
          title: "Contingencia ambiental Fase I en CDMX",
          summary:
            "Hoy no circula engomado rojo con holograma 2. Aplica a terminaciones de placa 3 y 4. Restricción vigente de 5:00 a 22:00 h.",
          severity: "urgent",
          sourceUrl: "https://www.semovi.cdmx.gob.mx/",
          category: "no_circula",
        },
        vehicle.displayName,
      ),
    },
  ];

  for (const item of sends) {
    await sendEmail(to, `[PRUEBA] ${item.subject}`, item.content);
    console.log(`✓ ${item.label} → ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(`\nEnviados ${sends.length} correos de prueba a ${to}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
