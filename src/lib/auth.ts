"use client";

import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, functions } from "@/lib/firebase";
import { seedDemoSessionIfNeeded } from "@/lib/demo-seed";
import { isNativePlatform } from "@/lib/local-notifications";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/types";

export type SessionMode = "dev" | "demo" | "google" | "link";

export const DEV_USER_ID = "dev-carcontrol-local";
export const DEMO_USER_ID = "demo-carcontrol";

const DEV_PASSWORD = "sisisi";
const DEFAULT_DEMO_PASSWORD = "demo";

function resolveDemoPassword(override?: string): string {
  if (override?.trim()) return override.trim();
  return process.env.NEXT_PUBLIC_DEMO_PASSWORD?.trim() || DEFAULT_DEMO_PASSWORD;
}

const SESSION_KEY = "carcontrol_session";
const SESSION_MODE_KEY = "carcontrol_session_mode";
const LINK_TOKEN_KEY = "carcontrol_link_token";
const LINK_TOKEN_LEGACY_KEY = "carcontrol_link_token";
const CLIENT_EMAIL_KEY = "carcontrol_client_email";

export interface CasinClientEmailChoice {
  token: string;
  clientName: string;
  vehicleCount: number;
}

export type SignInWithClientEmailResult =
  | AppUser
  | { choices: CasinClientEmailChoice[] };

export interface AppUser {
  uid: string;
  email: string | null;
  displayName?: string | null;
  sessionMode: SessionMode;
}

export const DEV_USER: AppUser = {
  uid: DEV_USER_ID,
  email: "dev@carcontrol.local",
  sessionMode: "dev",
};

export const DEMO_USER: AppUser = {
  uid: DEMO_USER_ID,
  email: "demo@carcontrol.app",
  sessionMode: "demo",
};

function userForMode(mode: SessionMode): AppUser {
  return mode === "demo" ? DEMO_USER : DEV_USER;
}

function getStoredMode(): SessionMode | null {
  if (typeof window === "undefined") return null;
  const mode = sessionStorage.getItem(SESSION_MODE_KEY);
  return mode === "demo" || mode === "dev" ? mode : null;
}

function readLinkTokenFromStorage(storage: Storage): string | null {
  const token = storage.getItem(LINK_TOKEN_KEY)?.trim();
  return token || null;
}

export function storeLinkToken(token: string): void {
  if (typeof window === "undefined") return;
  const normalized = token.trim();
  if (!normalized) return;
  localStorage.setItem(LINK_TOKEN_KEY, normalized);
  sessionStorage.removeItem(LINK_TOKEN_LEGACY_KEY);
}

export function clearStoredLinkToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LINK_TOKEN_KEY);
  sessionStorage.removeItem(LINK_TOKEN_LEGACY_KEY);
}

export function getStoredClientEmail(): string | null {
  if (typeof window === "undefined") return null;
  const email = localStorage.getItem(CLIENT_EMAIL_KEY)?.trim().toLowerCase();
  return email || null;
}

export function storeClientEmail(email: string): void {
  if (typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  localStorage.setItem(CLIENT_EMAIL_KEY, normalized);
}

export function clearStoredClientEmail(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CLIENT_EMAIL_KEY);
}

export function getStoredLinkToken(): string | null {
  if (typeof window === "undefined") return null;

  const fromLocal = readLinkTokenFromStorage(localStorage);
  if (fromLocal) return fromLocal;

  const legacy = readLinkTokenFromStorage(sessionStorage);
  if (!legacy) return null;

  localStorage.setItem(LINK_TOKEN_KEY, legacy);
  sessionStorage.removeItem(LINK_TOKEN_LEGACY_KEY);
  return legacy;
}

export function accessLinkPath(token: string): string {
  return `/acceso/${token.trim()}/`;
}

export function extractAccessTokenFromPathname(
  pathname: string | null | undefined,
): string | null {
  const match = String(pathname ?? "").match(/\/acceso\/([^/]+)\/?$/);
  const token = match?.[1]?.trim();
  if (!token || token === "_") return null;
  return token;
}

export function getStoredSession(): AppUser | null {
  if (typeof window === "undefined") return null;
  if (sessionStorage.getItem(SESSION_KEY) !== "ok") return null;
  const mode = getStoredMode();
  return mode ? userForMode(mode) : DEV_USER;
}

function googleSignInProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

function resolveSessionMode(firebaseUser: FirebaseUser): SessionMode {
  if (getStoredLinkToken()) return "link";
  const providers = firebaseUser.providerData.map((provider) => provider.providerId);
  return providers.includes("google.com") ? "google" : "link";
}

export function getCurrentAppUser(): AppUser | null {
  if (auth.currentUser) {
    return firebaseUserToAppUser(auth.currentUser);
  }
  return getStoredSession();
}

function firebaseUserToAppUser(user: FirebaseUser): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    sessionMode: resolveSessionMode(user),
  };
}

export async function signInWithGoogle(): Promise<AppUser | null> {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_MODE_KEY);
  clearStoredLinkToken();

  const provider = googleSignInProvider();

  if (isNativePlatform()) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  const result = await signInWithPopup(auth, provider);
  const user = firebaseUserToAppUser(result.user);
  await ensureUserProfile(user);
  return user;
}

export async function handleAuthRedirect(): Promise<void> {
  const result = await getRedirectResult(auth);
  if (!result) return;

  const user = firebaseUserToAppUser(result.user);
  await ensureUserProfile(user);
}

export async function signInWithPassword(
  password: string,
  mode: SessionMode = "dev",
): Promise<AppUser> {
  const expected = mode === "demo" ? resolveDemoPassword() : DEV_PASSWORD;
  if (password !== expected) {
    throw new Error("Contraseña incorrecta");
  }
  await firebaseSignOut(auth);
  clearStoredLinkToken();
  sessionStorage.setItem(SESSION_KEY, "ok");
  sessionStorage.setItem(SESSION_MODE_KEY, mode);
  const user = userForMode(mode);
  await ensureUserProfile(user);
  return user;
}

export async function signInDev(): Promise<AppUser> {
  return signInWithPassword(DEV_PASSWORD, "dev");
}

export async function signInDemo(password?: string): Promise<AppUser> {
  const user = await signInWithPassword(resolveDemoPassword(password), "demo");
  await seedDemoSessionIfNeeded();
  return user;
}

export async function signInWithAccessLink(token: string): Promise<AppUser> {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error("Enlace inválido");
  }

  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_MODE_KEY);

  const exchange = httpsCallable<
    { token: string },
    { customToken: string; token: string }
  >(functions, "exchangeAccessLink");
  const result = await exchange({ token: normalized });
  const customToken = result.data.customToken;
  const sessionToken = result.data.token || normalized;
  if (!customToken) {
    throw new Error("No se pudo iniciar sesión con el enlace");
  }

  await signInWithCustomToken(auth, customToken);
  storeLinkToken(sessionToken);

  const user = getCurrentAppUser();
  if (!user) {
    throw new Error("No se pudo iniciar sesión con el enlace");
  }

  if (user.email) storeClientEmail(user.email);
  await ensureUserProfile(user);
  return user;
}

function callableErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: string }).message ?? "").trim();
    if (message) return message;
  }
  return "No se pudo iniciar sesión";
}

async function completeClientEmailSignIn(
  email: string,
  token: string,
  customToken: string,
): Promise<AppUser> {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_MODE_KEY);

  await signInWithCustomToken(auth, customToken);
  storeLinkToken(token);
  storeClientEmail(email);

  const user = getCurrentAppUser();
  if (!user) {
    throw new Error("No se pudo iniciar sesión");
  }

  await ensureUserProfile(user);
  return user;
}

export async function signInWithClientEmail(
  email: string,
  token?: string,
): Promise<SignInWithClientEmailResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("Ingresa un correo válido");
  }

  const exchange = httpsCallable<
    { email: string; token?: string },
    | { customToken: string; token: string }
    | { choices: CasinClientEmailChoice[] }
  >(functions, "exchangeCasinClientEmail");

  try {
    const result = await exchange({
      email: normalized,
      ...(token ? { token } : {}),
    });
    const data = result.data;
    if ("choices" in data && Array.isArray(data.choices)) {
      return { choices: data.choices };
    }
    if (!("customToken" in data) || !data.customToken || !data.token) {
      throw new Error("No se pudo iniciar sesión");
    }
    return completeClientEmailSignIn(
      normalized,
      data.token,
      data.customToken,
    );
  } catch (error) {
    throw new Error(callableErrorMessage(error));
  }
}

export async function restoreLinkSessionIfNeeded(): Promise<AppUser | null> {
  if (auth.currentUser) {
    return getCurrentAppUser();
  }

  const token = getStoredLinkToken();
  if (token) {
    try {
      return await signInWithAccessLink(token);
    } catch {
      clearStoredLinkToken();
    }
  }

  const email = getStoredClientEmail();
  if (!email) return null;

  try {
    const result = await signInWithClientEmail(email);
    if ("choices" in result) {
      if (result.choices.length === 1) {
        return signInWithClientEmail(email, result.choices[0].token).then(
          (next) => ("choices" in next ? null : next),
        );
      }
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export async function logOut(): Promise<void> {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_MODE_KEY);
  clearStoredLinkToken();
  await firebaseSignOut(auth);
}

export function subscribeToAuth(callback: (user: AppUser | null) => void) {
  let active = true;
  let bootstrapped = false;

  const notify = (user: AppUser | null) => {
    if (!active) return;
    callback(user);
  };

  void (async () => {
    await handleAuthRedirect().catch(() => {});
    const restored = await restoreLinkSessionIfNeeded().catch(() => null);
    bootstrapped = true;
    if (!active) return;
    if (restored) {
      notify(restored);
      return;
    }
    if (auth.currentUser) {
      notify(firebaseUserToAppUser(auth.currentUser));
      return;
    }
    notify(getStoredSession());
  })();

  const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
    if (!active || !bootstrapped) return;
    if (firebaseUser) {
      notify(firebaseUserToAppUser(firebaseUser));
      return;
    }
    notify(getStoredSession());
  });

  function onStorage(e: StorageEvent) {
    if (
      e.key === SESSION_KEY ||
      e.key === SESSION_MODE_KEY ||
      e.key === LINK_TOKEN_KEY
    ) {
      if (auth.currentUser) return;
      notify(getStoredSession());
    }
  }
  window.addEventListener("storage", onStorage);

  return () => {
    active = false;
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}

async function ensureUserProfile(user: AppUser) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const displayName =
      user.sessionMode === "demo"
        ? "Demo"
        : user.sessionMode === "dev"
          ? "Dev"
          : (user.displayName ?? user.email?.split("@")[0] ?? "Usuario");

    await setDoc(ref, {
      email: user.email,
      displayName,
      preferences: DEFAULT_PREFERENCES,
      appOpenedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await activateNotificationsOnAppOpen(user.uid);
}

/** First time the user opens the app, email reminders for vencimientos turn on. */
export async function activateNotificationsOnAppOpen(
  userId: string,
): Promise<void> {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().appOpenedAt) return;

  await updateDoc(ref, {
    appOpenedAt: serverTimestamp(),
    "preferences.emailEnabled": true,
    updatedAt: serverTimestamp(),
  });
}

export async function getUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  const snap = await getDoc(doc(db, "users", userId));
  if (!snap.exists()) return DEFAULT_PREFERENCES;
  return { ...DEFAULT_PREFERENCES, ...snap.data().preferences };
}

export async function updateUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>,
): Promise<void> {
  const current = await getUserPreferences(userId);
  await setDoc(
    doc(db, "users", userId),
    {
      preferences: { ...current, ...preferences },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
