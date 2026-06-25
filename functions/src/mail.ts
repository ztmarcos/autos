import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { APP_NAME } from "./app-name";
import {
  buildWelcomeEmail,
  type EmailContent,
} from "./email-templates";
import type { VehicleEmailSummary } from "./vehicle-email";

export {
  buildAlertEmail,
  buildAlertEmailHtml,
  buildVehicleRegisteredEmail,
  buildWelcomeEmail,
  buildWelcomeEmailHtml,
} from "./email-templates";

let transporter: Transporter | null = null;
let fromAddress: string | null = null;

function normalizeAppPassword(password: string): string {
  return password.replace(/\s+/g, "");
}

export function getMailCredentialsFromEnv(): {
  account: string;
  password: string;
} | null {
  const account =
    process.env.GMAIL_ACCOUNT?.trim() || process.env.gmail_account?.trim();
  const password =
    process.env.GMAIL_PASSWORD?.trim() || process.env.gmail_password?.trim();

  if (!account || !password) return null;
  return { account, password: normalizeAppPassword(password) };
}

export function configureMail(account: string, password: string): void {
  fromAddress = account;
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: account,
      pass: normalizeAppPassword(password),
    },
  });
}

export function isMailConfigured(): boolean {
  return Boolean(transporter && fromAddress);
}

export async function sendEmail(
  to: string,
  subject: string,
  content: EmailContent | string,
  options?: { cc?: string | string[] },
): Promise<void> {
  if (!transporter || !fromAddress) {
    throw new Error("Mail not configured");
  }

  const html = typeof content === "string" ? content : content.html;
  const text =
    typeof content === "string"
      ? content.replace(/<[^>]+>/g, "").trim()
      : content.text;

  await transporter.sendMail({
    from: `${APP_NAME} <${fromAddress}>`,
    to,
    cc: options?.cc,
    subject,
    html,
    text,
  });
}

export async function sendWelcomeEmail(
  to: string,
  displayName?: string,
  vehicles: VehicleEmailSummary[] = [],
  options?: { cc?: string | string[] },
): Promise<void> {
  await sendEmail(
    to,
    `Bienvenido a ${APP_NAME}`,
    buildWelcomeEmail(displayName, vehicles),
    options,
  );
}
