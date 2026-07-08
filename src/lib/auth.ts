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
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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

export function getStoredLinkToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(LINK_TOKEN_KEY)?.trim();
  return token || null;
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
  sessionStorage.removeItem(LINK_TOKEN_KEY);

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
  sessionStorage.removeItem(LINK_TOKEN_KEY);
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

  const exchange = httpsCallable<{ token: string }, { customToken: string }>(
    functions,
    "exchangeAccessLink",
  );
  const result = await exchange({ token: normalized });
  const customToken = result.data.customToken;
  if (!customToken) {
    throw new Error("No se pudo iniciar sesión con el enlace");
  }

  await signInWithCustomToken(auth, customToken);
  sessionStorage.setItem(LINK_TOKEN_KEY, normalized);

  const user = getCurrentAppUser();
  if (!user) {
    throw new Error("No se pudo iniciar sesión con el enlace");
  }

  await ensureUserProfile(user);
  return user;
}

export async function restoreLinkSessionIfNeeded(): Promise<AppUser | null> {
  if (auth.currentUser) {
    return getCurrentAppUser();
  }

  const token = getStoredLinkToken();
  if (!token) return null;

  try {
    return await signInWithAccessLink(token);
  } catch {
    sessionStorage.removeItem(LINK_TOKEN_KEY);
    return null;
  }
}

export async function logOut(): Promise<void> {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_MODE_KEY);
  sessionStorage.removeItem(LINK_TOKEN_KEY);
  await firebaseSignOut(auth);
}

export function subscribeToAuth(callback: (user: AppUser | null) => void) {
  let active = true;

  void handleAuthRedirect().catch(() => {});

  void restoreLinkSessionIfNeeded()
    .then((user) => {
      if (!active || !user) return;
      callback(user);
    })
    .catch(() => {});

  const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
    if (!active) return;
    if (firebaseUser) {
      callback(firebaseUserToAppUser(firebaseUser));
      return;
    }
    callback(getStoredSession());
  });

  function onStorage(e: StorageEvent) {
    if (
      e.key === SESSION_KEY ||
      e.key === SESSION_MODE_KEY ||
      e.key === LINK_TOKEN_KEY
    ) {
      if (auth.currentUser) return;
      callback(getStoredSession());
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
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
