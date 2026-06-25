import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isNativePlatform } from "@/lib/local-notifications";

export async function initPushNotifications(userId: string): Promise<void> {
  if (!isNativePlatform()) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;

  await PushNotifications.register();

  PushNotifications.addListener("registration", async (token) => {
    const tokenId = token.value.slice(0, 32);
    await setDoc(doc(db, "device_tokens", `${userId}_${tokenId}`), {
      userId,
      token: token.value,
      platform: "ios",
      updatedAt: serverTimestamp(),
    });
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("Push registration error:", err);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const vehicleId = action.notification.data?.vehicleId;
    if (vehicleId && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("carcontrol:open-vehicle", { detail: { vehicleId } }),
      );
    }
  });
}

export async function setupPushIfEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  if (enabled && isNativePlatform()) {
    await initPushNotifications(userId);
  }
}
