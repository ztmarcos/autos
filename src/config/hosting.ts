/** Build del sitio demo dedicado (Firebase Hosting separado). */
export const IS_DEMO_HOSTING =
  process.env.NEXT_PUBLIC_DEMO_HOSTING === "true";

export const DEMO_HOSTING_SITE = "autos-fa58f-demo";

export const DEMO_HOSTING_URL =
  process.env.NEXT_PUBLIC_DEMO_HOSTING_URL ??
  `https://${DEMO_HOSTING_SITE}.web.app`;
