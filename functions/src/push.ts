import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToUser(
  db: Firestore,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  const tokensSnap = await db
    .collection("device_tokens")
    .where("userId", "==", userId)
    .get();

  if (tokensSnap.empty) return 0;

  const tokens = tokensSnap.docs
    .map((doc) => doc.data().token as string | undefined)
    .filter((token): token is string => Boolean(token));

  if (tokens.length === 0) return 0;

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data ?? {},
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  });

  await Promise.all(
    response.responses.map(async (result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        await tokensSnap.docs[index]?.ref.delete();
      }
    }),
  );

  return response.successCount;
}
