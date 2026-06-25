import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MxStateNews, StateNewsAlert } from "@/lib/types";

function mapStateNews(id: string, data: Record<string, unknown>): MxStateNews {
  return {
    stateCode: id,
    lastFetchedAt: (data.lastFetchedAt as string) ?? "",
    alerts: (data.alerts as StateNewsAlert[]) ?? [],
  };
}

export function subscribeToStateNews(
  stateCode: string,
  callback: (news: MxStateNews | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, "mx_state_news", stateCode), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(mapStateNews(snap.id, snap.data()));
  });
}

export function subscribeToAllStateNews(
  stateCodes: string[],
  callback: (alerts: StateNewsAlert[]) => void,
): Unsubscribe {
  const unique = [...new Set(stateCodes.filter(Boolean))];
  if (unique.length === 0) {
    callback([]);
    return () => {};
  }

  const byState = new Map<string, StateNewsAlert[]>();
  const unsubs = unique.map((code) =>
    subscribeToStateNews(code, (news) => {
      byState.set(code, news?.alerts ?? []);
      const merged = [...byState.values()].flat();
      const deduped = [
        ...new Map(merged.map((alert) => [alert.id, alert])).values(),
      ];
      callback(deduped);
    }),
  );

  return () => unsubs.forEach((unsub) => unsub());
}
