import { APP_NAME } from "./app-name";
import { isMotoVehicle } from "./no-circula";
import {
  vehicleDetailLines,
  type VehicleEmailSummary,
} from "./vehicle-email";

export const EMAIL_COLORS = {
  background: "#fafbfc",
  foreground: "#111827",
  accent: "#1e293b",
  surface: "#ffffff",
  surfaceMuted: "#f3f5f7",
  border: "#e8eaed",
  muted: "rgba(17, 24, 39, 0.5)",
  ok: "#3a9b6d",
  okSoft: "rgba(58, 155, 109, 0.12)",
} as const;

export const APP_URL =
  process.env.APP_URL?.trim() || "https://autos-fa58f.web.app";

export const LOGO_URL = `${APP_URL}/logo-email.png`;

export interface EmailContent {
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function featureRow(icon: string, title: string, text: string): string {
  return `
    <tr>
      <td style="padding: 0 0 16px 0; vertical-align: top; width: 36px;">
        <div style="width: 32px; height: 32px; border-radius: 8px; background: ${EMAIL_COLORS.okSoft}; color: ${EMAIL_COLORS.ok}; font-size: 16px; line-height: 32px; text-align: center;">
          ${icon}
        </div>
      </td>
      <td style="padding: 0 0 16px 12px; vertical-align: top;">
        <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${EMAIL_COLORS.foreground};">
          ${escapeHtml(title)}
        </p>
        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: ${EMAIL_COLORS.muted};">
          ${escapeHtml(text)}
        </p>
      </td>
    </tr>
  `;
}

export function wrapEmailHtml(
  bodyHtml: string,
  options?: { preheader?: string; hideBrandHeader?: boolean },
): string {
  const preheader = options?.preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(options.preheader)}</span>`
    : "";

  const header = options?.hideBrandHeader
    ? ""
    : `
            <tr>
              <td style="padding:32px 32px 24px;text-align:center;background:${EMAIL_COLORS.surface};">
                <div style="display:inline-block;background:#ffffff;padding:12px 16px;border-radius:12px;border:1px solid ${EMAIL_COLORS.border};">
                  <img src="${LOGO_URL}" alt="${APP_NAME}" width="140" height="76" style="display:block;margin:0 auto;border:0;outline:none;" />
                </div>
                <p style="margin:0;font-size:13px;letter-spacing:0.02em;color:${EMAIL_COLORS.muted};">
                  Control vehicular para México
                </p>
              </td>
            </tr>`;

  const footer = options?.hideBrandHeader
    ? `
            <tr>
              <td style="padding:16px 32px;background:${EMAIL_COLORS.surfaceMuted};border-top:1px solid ${EMAIL_COLORS.border};">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center;">
                  CASIN Seguros · www.casinseguros.com
                </p>
              </td>
            </tr>`
    : `
            <tr>
              <td style="padding:20px 32px;background:${EMAIL_COLORS.surfaceMuted};border-top:1px solid ${EMAIL_COLORS.border};">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center;">
                  ${APP_NAME} · Alertas automáticas de tus vehículos
                </p>
              </td>
            </tr>`;

  return `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${APP_NAME}</title>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_COLORS.background};color:${EMAIL_COLORS.foreground};font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    ${preheader}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.border};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(17,24,39,0.08);">
            ${header}
            <tr>
              <td style="padding:${options?.hideBrandHeader ? "24px 24px 32px" : "0 32px 32px"};">
                ${bodyHtml}
              </td>
            </tr>
            ${footer}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function primaryButton(label: string, href: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto 0;">
      <tr>
        <td style="border-radius:8px;background:${EMAIL_COLORS.accent};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function emailFooterText(): string {
  return `\n--\n${APP_NAME} · Control vehicular para México\n${APP_URL}`;
}

function vehicleCardHtml(vehicle: VehicleEmailSummary): string {
  const meta = [
    escapeHtml(vehicle.plate),
    escapeHtml(vehicle.stateName),
    vehicle.brand ? escapeHtml(vehicle.brand) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hideVerification = isMotoVehicle(vehicle);
  const dates = [
    !hideVerification && vehicle.verificationDate
      ? `Verificación ${escapeHtml(vehicle.verificationDate)}`
      : null,
    vehicle.tenenciaDate ? `Tenencia ${escapeHtml(vehicle.tenenciaDate)}` : null,
    vehicle.refrendoDate ? `Refrendo ${escapeHtml(vehicle.refrendoDate)}` : null,
    vehicle.serviceDate ? `Servicio ${escapeHtml(vehicle.serviceDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <tr>
      <td style="padding:0 0 12px;">
        <div style="background:${EMAIL_COLORS.surfaceMuted};border-radius:12px;padding:14px 16px;border:1px solid ${EMAIL_COLORS.border};">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:${EMAIL_COLORS.foreground};">
            ${escapeHtml(vehicle.displayName)}
          </p>
          <p style="margin:0 0 ${dates ? "6px" : "0"};font-size:13px;color:${EMAIL_COLORS.muted};">
            ${meta}
          </p>
          ${
            dates
              ? `<p style="margin:0;font-size:12px;color:${EMAIL_COLORS.muted};">${dates}</p>`
              : ""
          }
        </div>
      </td>
    </tr>
  `;
}

function vehicleListHtml(
  vehicles: VehicleEmailSummary[],
  title = "Tus autos registrados",
): string {
  if (vehicles.length === 0) return "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
      <tr>
        <td>
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">
            ${escapeHtml(title)}
          </p>
        </td>
      </tr>
      ${vehicles.map((vehicle) => vehicleCardHtml(vehicle)).join("")}
    </table>
  `;
}

function vehicleSummaryBlockHtml(
  title: string,
  lines: string[],
): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.surfaceMuted};border-radius:12px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">
            ${escapeHtml(title)}
          </p>
          ${lines
            .map(
              (line) =>
                `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${EMAIL_COLORS.foreground};">${escapeHtml(line)}</p>`,
            )
            .join("")}
        </td>
      </tr>
    </table>
  `;
}

export function buildWelcomeEmail(
  displayName?: string,
  vehicles: VehicleEmailSummary[] = [],
): EmailContent {
  const name = displayName?.trim();
  const greeting = name ? `Hola, ${name}` : "Hola";
  const hasVehicles = vehicles.length > 0;
  const buttonLabel = hasVehicles
    ? "Ver mis autos"
    : "Registra tu primer auto";

  const intro = hasVehicles
    ? vehicles.length === 1
      ? "Gracias por registrar tu auto con nosotros. Ya lo tienes en tu cuenta y te avisaremos antes de cada fecha importante."
      : `Gracias por registrar tus ${vehicles.length} autos con nosotros. Ya los tienes en tu cuenta y te avisaremos antes de cada fecha importante.`
    : "Tu cuenta está lista. Registra tu primer auto para llevar el control de verificación, tenencia, seguro y servicio.";

  const body = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:600;color:${EMAIL_COLORS.foreground};text-align:center;">
      Bienvenido a ${APP_NAME}
    </h1>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:${EMAIL_COLORS.foreground};text-align:center;">
      ${escapeHtml(greeting)}
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.muted};text-align:center;">
      ${escapeHtml(intro)}
    </p>

    ${vehicleListHtml(vehicles)}

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">
      ${featureRow("🔔", "Alertas a tiempo", "Recibe avisos antes de que venza verificación, tenencia o póliza.")}
      ${featureRow("📄", "Documentos con IA", "Escanea tarjetas de circulación y pólizas para extraer datos automáticamente.")}
      ${featureRow("🗓️", "No circula y noticias", "Consulta restricciones y novedades relevantes para tu estado.")}
    </table>

    ${primaryButton(buttonLabel, APP_URL)}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center;">
      Puedes activar o desactivar correos en Ajustes cuando quieras.
    </p>
  `;

  const vehicleText = hasVehicles
    ? `\nTus autos registrados:\n${vehicles
        .map(
          (vehicle) =>
            `- ${vehicle.displayName} (${vehicle.plate}, ${vehicle.stateName})`,
        )
        .join("\n")}\n`
    : "";

  const text = `${greeting}

Bienvenido a ${APP_NAME}.

${intro}
${vehicleText}
- Alertas a tiempo: avisos antes de que venza verificación, tenencia o póliza.
- Documentos con IA: escanea tarjetas de circulación y pólizas.
- No circula y noticias: restricciones y novedades de tu estado.

${buttonLabel}: ${APP_URL}

Puedes activar o desactivar correos en Ajustes cuando quieras.${emailFooterText()}`;

  return {
    html: wrapEmailHtml(body, {
      preheader: hasVehicles
        ? "Gracias por registrar tus autos con autoControl."
        : "Tu cuenta está lista. Registra tu primer auto.",
    }),
    text,
  };
}

export function buildWelcomeEmailHtml(
  displayName?: string,
  vehicles: VehicleEmailSummary[] = [],
): string {
  return buildWelcomeEmail(displayName, vehicles).html;
}

export function buildVehicleRegisteredEmail(
  vehicle: VehicleEmailSummary,
): EmailContent {
  const lines = vehicleDetailLines(vehicle);

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${EMAIL_COLORS.foreground};text-align:center;">
      Auto registrado
    </h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.muted};text-align:center;">
      ${escapeHtml(vehicle.displayName)} quedó guardado en tu cuenta. Te avisaremos antes de cada fecha importante.
    </p>

    ${vehicleSummaryBlockHtml("Resumen del registro", lines)}

    ${primaryButton("Ver auto", APP_URL)}
  `;

  const text = `Auto registrado en ${APP_NAME}

${vehicle.displayName} quedó guardado en tu cuenta.

Resumen del registro:
${lines.map((line) => `- ${line}`).join("\n")}

Ver auto: ${APP_URL}${emailFooterText()}`;

  return {
    html: wrapEmailHtml(body, {
      preheader: `Registrado: ${vehicle.displayName} (${vehicle.plate})`,
    }),
    text,
  };
}

export function buildAlertEmail(
  vehicleName: string,
  eventLabel: string,
  dueDate: string,
  daysUntil: number,
): EmailContent {
  const urgency =
    daysUntil < 0
      ? "Vencido"
      : daysUntil === 0
        ? "Vence hoy"
        : `En ${daysUntil} días`;

  const urgencyColor =
    daysUntil < 0
      ? "#c95656"
      : daysUntil === 0
        ? "#c4922e"
        : EMAIL_COLORS.ok;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${EMAIL_COLORS.foreground};">
      ${escapeHtml(eventLabel)}
    </h1>
    <p style="margin:0 0 20px;font-size:15px;color:${EMAIL_COLORS.muted};">
      ${escapeHtml(vehicleName)}
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.surfaceMuted};border-radius:12px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.muted};">Fecha límite</p>
          <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:${EMAIL_COLORS.foreground};">${escapeHtml(dueDate)}</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:${urgencyColor};">${urgency}</p>
        </td>
      </tr>
    </table>
    ${primaryButton("Ver vehículo", APP_URL)}
  `;

  const text = `${eventLabel} — ${vehicleName}

Fecha límite: ${dueDate}
Estado: ${urgency}

Ver vehículo: ${APP_URL}${emailFooterText()}`;

  return {
    html: wrapEmailHtml(body, {
      preheader: `${eventLabel} — ${vehicleName}`,
    }),
    text,
  };
}

export function buildAlertEmailHtml(
  vehicleName: string,
  eventLabel: string,
  dueDate: string,
  daysUntil: number,
): string {
  return buildAlertEmail(vehicleName, eventLabel, dueDate, daysUntil).html;
}

const SEVERITY_COLORS: Record<string, string> = {
  urgent: "#c95656",
  warning: "#c4922e",
  info: EMAIL_COLORS.ok,
};

export function buildStateNewsEmail(
  alert: {
    title: string;
    summary: string;
    severity: "info" | "warning" | "urgent";
    sourceUrl: string;
    category: string;
  },
  vehicleName?: string,
): EmailContent {
  const severityLabel =
    alert.severity === "urgent"
      ? "Urgente"
      : alert.severity === "warning"
        ? "Importante"
        : "Informativo";
  const severityColor = SEVERITY_COLORS[alert.severity] ?? EMAIL_COLORS.ok;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${EMAIL_COLORS.foreground};">
      ${escapeHtml(alert.title)}
    </h1>
    ${
      vehicleName
        ? `<p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.muted};">
            Aplica a tu vehículo: ${escapeHtml(vehicleName)}
          </p>`
        : ""
    }
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.surfaceMuted};border-radius:12px;margin:0 0 20px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${severityColor};">
            ${escapeHtml(severityLabel)}
          </p>
          <p style="margin:0;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.foreground};">
            ${escapeHtml(alert.summary)}
          </p>
        </td>
      </tr>
    </table>
    ${primaryButton("Abrir autoControl", APP_URL)}

    <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${EMAIL_COLORS.muted};text-align:center;">
      <a href="${escapeHtml(alert.sourceUrl || APP_URL)}" style="color:${EMAIL_COLORS.muted};">
        Ver fuente oficial
      </a>
    </p>
  `;

  const text = `${alert.title}

${vehicleName ? `Aplica a: ${vehicleName}\n` : ""}${severityLabel}

${alert.summary}

Fuente: ${alert.sourceUrl || APP_URL}
Abrir app: ${APP_URL}${emailFooterText()}`;

  return {
    html: wrapEmailHtml(body, {
      preheader: alert.summary.slice(0, 120),
    }),
    text,
  };
}

const CASIN_NAVY = "#1B365D";
const CASIN_ORANGE = "#E87722";
export const CASIN_FLYER_CID = "casin-flyer";

function formatDisplayDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return value;
}

export function buildCasinInviteEmail(options: {
  clientName: string;
  vehicles: VehicleEmailSummary[];
  accessUrl: string;
  flyerSrc?: string;
}): EmailContent {
  const name = options.clientName.trim() || "cliente";
  const flyerSrc = options.flyerSrc || `cid:${CASIN_FLYER_CID}`;
  const vehicles = options.vehicles.map((vehicle) => {
    const mapped = {
      ...vehicle,
      alias: vehicle.alias || vehicle.displayName,
      insuranceExpiryDate: formatDisplayDate(vehicle.insuranceExpiryDate),
      verificationDate: formatDisplayDate(vehicle.verificationDate),
      tenenciaDate: formatDisplayDate(vehicle.tenenciaDate),
      refrendoDate: formatDisplayDate(vehicle.refrendoDate),
      serviceDate: formatDisplayDate(vehicle.serviceDate),
    };
    if (isMotoVehicle(mapped)) {
      mapped.verificationDate = undefined;
    }
    return mapped;
  });

  const motoOnly =
    vehicles.length > 0 && vehicles.every((vehicle) => isMotoVehicle(vehicle));
  const paragraphs = motoOnly
    ? [
        "Quiero presentarte una nueva aplicación que hemos desarrollado para que puedas tener toda la información y documentación de tus vehículos en un solo lugar.",
        "Desde la aplicación podrás consultar documentos, recibir alertas de vencimientos como la póliza y mantener actualizada la información de tus vehículos.",
        "Además, podrás dar de alta otros vehículos, aunque no estén asegurados con nosotros, convirtiendo la aplicación en una herramienta para administrar de manera integral todos tus vehículos.",
        "La idea es ofrecerte un servicio adicional que te ayude a no olvidar fechas importantes y tener siempre a la mano la documentación de tus vehículos.",
      ]
    : [
        "Quiero presentarte una nueva aplicación que hemos desarrollado para que puedas tener toda la información y documentación de tus vehículos en un solo lugar.",
        "Desde la aplicación podrás consultar documentos, recibir alertas importantes como “Hoy No Circula”, verificación y otros vencimientos, así como mantener actualizada la información de tus vehículos.",
        "Además, podrás dar de alta otros vehículos, aunque no estén asegurados con nosotros, convirtiendo la aplicación en una herramienta para administrar de manera integral todos tus vehículos.",
        "La idea es ofrecerte un servicio adicional que te ayude a no olvidar fechas importantes y tener siempre a la mano la documentación de tus vehículos.",
      ];

  const body = `
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;color:${CASIN_NAVY};">
      Una nueva forma de administrar tus vehículos
    </h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_COLORS.foreground};">
      Estimado ${escapeHtml(name)}:
    </p>
    ${paragraphs
      .map(
        (paragraph) => `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${EMAIL_COLORS.foreground};">
      ${escapeHtml(paragraph)}
    </p>`,
      )
      .join("")}

    ${vehicleListHtml(vehicles, "Tus vehículos")}

    ${primaryButton("Ver mis vehículos", options.accessUrl)}

    <p style="margin:28px 0 4px;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.foreground};">
      Marcos Zavala
    </p>
    <p style="margin:0 0 24px;font-size:14px;font-weight:600;color:${CASIN_ORANGE};">
      CASIN Seguros
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.surfaceMuted};border-radius:12px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:${EMAIL_COLORS.muted};">
            Nota importante
          </p>
          <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:${EMAIL_COLORS.muted};">
            Esta información se encuentra solamente en nuestros dispositivos electrónicos y no se tiene acceso a ella desde ningún punto público, respetando las disposiciones de la Ley de Protección de Datos.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:${EMAIL_COLORS.muted};">
            Estamos a tus órdenes para atender otras necesidades de protección que tengas.
          </p>
        </td>
      </tr>
    </table>
    <img src="${escapeHtml(flyerSrc)}" alt="CASIN Seguros" width="496" style="display:block;width:100%;max-width:496px;height:auto;border:0;outline:none;margin:28px 0 0;border-radius:12px;" />
  `;

  const vehicleText = vehicles.length
    ? `\nTus vehículos:\n${vehicles
        .map((vehicle) => {
          const extra = vehicle.insuranceExpiryDate
            ? `, póliza hasta ${vehicle.insuranceExpiryDate}`
            : "";
          return `- ${vehicle.displayName} (${vehicle.plate}${extra})`;
        })
        .join("\n")}\n`
    : "";

  const text = `Una nueva forma de administrar tus vehículos

Estimado ${name}:

${paragraphs.join("\n\n")}
${vehicleText}
Ver mis vehículos: ${options.accessUrl}

Marcos Zavala
CASIN Seguros

Nota importante: Esta información se encuentra solamente en nuestros dispositivos electrónicos y no se tiene acceso a ella desde ningún punto público, respetando las disposiciones de la Ley de Protección de Datos.
Estamos a tus órdenes para atender otras necesidades de protección que tengas.`;

  return {
    html: wrapEmailHtml(body, {
      preheader: "Consulta tus documentos, alertas y vencimientos en un solo lugar.",
      hideBrandHeader: true,
    }),
    text,
  };
}
