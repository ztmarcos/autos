import type { StateNewsAlert, Vehicle } from "@/lib/types";
import { getPlateLastDigit } from "@/lib/mx-rules";
import {
  isContingencyAlert,
  isExemptCalcomania,
  isNoCirculaEligibleVehicle,
  type NoCirculaInfo,
} from "@/lib/no-circula";

export interface VehicleNewsItem {
  id: string;
  title: string;
  summary: string;
  severity: StateNewsAlert["severity"];
  sourceUrl?: string;
  kind: "no_circula" | "news";
}

function isNoCirculaRelatedAlert(alert: StateNewsAlert): boolean {
  if (alert.category === "no_circula") return true;
  const text = `${alert.title} ${alert.summary}`.toLowerCase();
  return (
    text.includes("no circula") ||
    text.includes("contingencia ambiental") ||
    text.includes("contingencia")
  );
}

function alertAffectsCalcomania(
  alert: StateNewsAlert,
  calcomania?: string,
): boolean {
  if (!calcomania?.trim()) return false;
  if (isExemptCalcomania(calcomania)) return false;

  const affected =
    alert.affectedHolograms ??
    (isContingencyAlert(alert) ? ["1", "2"] : undefined);
  if (!affected?.length) return true;

  return affected.includes(calcomania);
}

export function alertAppliesToVehicle(
  alert: StateNewsAlert,
  vehicle: Vehicle,
): boolean {
  if (!alert.stateCodes.includes(vehicle.state)) return false;

  if (isNoCirculaRelatedAlert(alert)) {
    if (!isNoCirculaEligibleVehicle(vehicle)) return false;
    if (!alertAffectsCalcomania(alert, vehicle.calcomania)) return false;
  }

  if (!alert.plateDigits?.length) return true;

  const digit = getPlateLastDigit(vehicle.plate);
  if (!digit) return true;

  return alert.plateDigits.includes(digit);
}

function isNoCirculaTopic(alert: StateNewsAlert): boolean {
  if (alert.category === "no_circula") return true;
  const text = `${alert.title} ${alert.summary}`.toLowerCase();
  return text.includes("no circula") || text.includes("contingencia ambiental");
}

function isRecentContingencyNews(alert: StateNewsAlert): boolean {
  if (!isContingencyAlert(alert)) return false;
  const published = new Date(alert.publishedAt);
  if (Number.isNaN(published.getTime())) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1);
  return published >= cutoff;
}

function getAlertTopicKey(alert: StateNewsAlert): string {
  if (isNoCirculaTopic(alert)) return "no_circula";
  if (alert.category !== "general") return alert.category;
  return alert.id;
}

function dedupeAlertsByTopic(alerts: StateNewsAlert[]): StateNewsAlert[] {
  const seen = new Set<string>();
  const deduped: StateNewsAlert[] = [];

  for (const alert of alerts) {
    const key = getAlertTopicKey(alert);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(alert);
  }

  return deduped;
}

function shouldIncludeNewsAlert(
  alert: StateNewsAlert,
  noCircula: NoCirculaInfo | null,
): boolean {
  if (!isNoCirculaTopic(alert)) return true;
  if (noCircula) return false;
  return isRecentContingencyNews(alert);
}

export function getVehicleNewsItems(
  vehicle: Vehicle,
  alerts: StateNewsAlert[],
  noCircula: NoCirculaInfo | null,
): VehicleNewsItem[] {
  const items: VehicleNewsItem[] = [];

  if (noCircula) {
    items.push({
      id: "no-circula-today",
      title: noCircula.title,
      summary: noCircula.detail,
      severity: noCircula.status === "no_circula" ? "urgent" : "warning",
      sourceUrl: noCircula.sourceUrl,
      kind: "no_circula",
    });
  }

  const relevant = dedupeAlertsByTopic(
    alerts
      .filter((alert) => alertAppliesToVehicle(alert, vehicle))
      .filter((alert) => shouldIncludeNewsAlert(alert, noCircula))
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      ),
  ).slice(0, 5);

  for (const alert of relevant) {
    items.push({
      id: alert.id,
      title: alert.title,
      summary: alert.summary,
      severity: alert.severity,
      sourceUrl: alert.sourceUrl,
      kind: "news",
    });
  }

  return items;
}

export function hasRelevantVehicleNews(
  vehicle: Vehicle,
  alerts: StateNewsAlert[],
  noCircula: NoCirculaInfo | null,
): boolean {
  return getVehicleNewsItems(vehicle, alerts, noCircula).length > 0;
}
