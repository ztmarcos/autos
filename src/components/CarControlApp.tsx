"use client";

import { useCallback, useEffect, useState } from "react";
import { getDocs, collection } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "@/components/AuthProvider";
import { LoginView } from "@/components/LoginView";
import { Header } from "@/components/Header";
import { HomeView } from "@/components/HomeView";
import { ExpiryStatusLegend } from "@/components/ExpiryStatusLegend";
import { VehicleDetail } from "@/components/VehicleDetail";
import { VehicleForm } from "@/components/VehicleForm";
import { AlertsOverlay } from "@/components/AlertsOverlay";
import { SettingsView } from "@/components/SettingsView";
import { APP_NAME } from "@/config/app";
import { IS_DEMO_HOSTING } from "@/config/hosting";
import { DocumentDetail } from "@/components/DocumentDetail";
import type {
  DocumentType,
  MxVehicleRule,
  StateNewsAlert,
  Vehicle,
  VehicleDocument,
  VehicleEvent,
  View,
} from "@/lib/types";
import { db, functions } from "@/lib/firebase";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  sortVehiclesByUrgency,
  subscribeToUserVehicles,
  updateVehicle,
  getVehicleDisplayName,
} from "@/lib/vehicles";
import { subscribeToNotifications, getUnreadCount } from "@/lib/notifications";
import { subscribeToDocuments, uploadCardDocument, resolveInsuranceExpiry, getInsuranceExpiriesForVehicles, upsertManualDocument } from "@/lib/documents";
import type { VehicleCardFields } from "@/lib/vehicle-card-map";
import {
  buildVehicleGeneralPatch,
  syncAllVehiclesGeneral,
  vehiclePatchDiffers,
} from "@/lib/vehicle-sync";
import type { AppNotification } from "@/lib/types";
import {
  scheduleVehicleNotifications,
  cancelVehicleNotifications,
} from "@/lib/local-notifications";
import {
  syncVehicleToCalendar,
  removeVehicleCalendarEvents,
} from "@/lib/calendar-sync";
import { getUserPreferences } from "@/lib/auth";
import { seedDemoSessionIfNeeded } from "@/lib/demo-seed";
import { setupPushIfEnabled } from "@/lib/push-notifications";
import { MX_RULES_SEED } from "@/lib/mx-rules";
import { syncBrandLogosForVehicles } from "@/lib/brand-logo";
import { subscribeToAllStateNews } from "@/lib/state-news";

export function CarControlApp() {
  const { user, loading: authLoading } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rules, setRules] = useState<MxVehicleRule[]>(MX_RULES_SEED);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isTablet, setIsTablet] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );
  const [loading, setLoading] = useState(true);
  const [stateNewsAlerts, setStateNewsAlerts] = useState<StateNewsAlert[]>([]);
  const [stateNewsUpdatedAt, setStateNewsUpdatedAt] = useState<string>();
  const [insuranceExpiries, setInsuranceExpiries] = useState<
    Record<string, string>
  >({});

  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const selectedDoc = selectedDocId
    ? documents.find((d) => d.id === selectedDocId) ?? null
    : null;

  const loadVehicles = useCallback(async () => {
    if (!user) return;
    const list = await listVehicles(user.uid);
    const synced = await syncAllVehiclesGeneral(list);
    const withLogos = await syncBrandLogosForVehicles(synced);
    setVehicles(sortVehiclesByUrgency(withLogos));
    const expiries = await getInsuranceExpiriesForVehicles(withLogos);
    setInsuranceExpiries(expiries);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      if (user.sessionMode === "demo") {
        await seedDemoSessionIfNeeded();
      }
      const list = await listVehicles(user.uid);
      if (cancelled) return;
      const synced = await syncAllVehiclesGeneral(list);
      if (cancelled) return;
      const withLogos = await syncBrandLogosForVehicles(synced);
      if (cancelled) return;
      setVehicles(sortVehiclesByUrgency(withLogos));
      const expiries = await getInsuranceExpiriesForVehicles(withLogos);
      if (cancelled) return;
      setInsuranceExpiries(expiries);
      setLoading(false);
    })();

    const unsubscribe = subscribeToUserVehicles(user.uid, (list) => {
      if (cancelled) return;
      void syncAllVehiclesGeneral(list).then((synced) => {
        if (cancelled) return;
        setVehicles(sortVehiclesByUrgency(synced));
        void syncBrandLogosForVehicles(synced);
        void getInsuranceExpiriesForVehicles(synced).then((expiries) => {
          if (!cancelled) setInsuranceExpiries(expiries);
        });
      });
    });

    getUserPreferences(user.uid).then((prefs) => {
      if (!cancelled && prefs.pushEnabled) setupPushIfEnabled(user.uid, true);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user || vehicles.length === 0) {
      setStateNewsAlerts([]);
      setStateNewsUpdatedAt(undefined);
      return;
    }

    const stateCodes = vehicles.map((vehicle) => vehicle.state);
    return subscribeToAllStateNews(stateCodes, setStateNewsAlerts);
  }, [user, vehicles]);

  useEffect(() => {
    if (!user) return;
    return subscribeToNotifications(user.uid, setNotifications);
  }, [user]);

  useEffect(() => {
    if (!user || vehicles.length === 0) return;

    const stateCodes = [...new Set(vehicles.map((vehicle) => vehicle.state))];
    let cancelled = false;

    void (async () => {
      const { getDoc, doc } = await import("firebase/firestore");
      const timestamps = await Promise.all(
        stateCodes.map(async (code) => {
          const snap = await getDoc(doc(db, "mx_state_news", code));
          return (snap.data()?.lastFetchedAt as string | undefined) ?? "";
        }),
      );
      if (cancelled) return;
      const latest = timestamps
        .filter(Boolean)
        .sort(
          (a, b) => new Date(b).getTime() - new Date(a).getTime(),
        )[0];
      setStateNewsUpdatedAt(latest);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, vehicles, stateNewsAlerts]);

  useEffect(() => {
    if (!user) return;
    async function loadRules() {
      let snap = await getDocs(collection(db, "mx_vehicle_rules"));
      if (snap.empty) {
        try {
          await httpsCallable(functions, "seedMxRules")();
          snap = await getDocs(collection(db, "mx_vehicle_rules"));
        } catch {
          // seed requires deployed functions
        }
      }
      if (!snap.empty) {
        setRules(
          snap.docs.map((d) => ({ ...d.data(), stateCode: d.id }) as MxVehicleRule),
        );
      }
    }
    void loadRules();
  }, [user]);

  useEffect(() => {
    if (!selectedId) return;
    return subscribeToDocuments(selectedId, setDocuments);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !selected) return;
    const expiry = resolveInsuranceExpiry(selected, documents);
    setInsuranceExpiries((prev) => {
      if (expiry) {
        if (prev[selectedId] === expiry) return prev;
        return { ...prev, [selectedId]: expiry };
      }
      if (selected.insuranceExpiryDate?.trim() || !(selectedId in prev)) return prev;
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
  }, [selectedId, selected, documents]);

  useEffect(() => {
    if (!selectedId || !selected || documents.length === 0) return;
    const patch = buildVehicleGeneralPatch(selected, documents);
    if (!vehiclePatchDiffers(selected, patch)) return;

    let cancelled = false;
    void updateVehicle(selectedId, patch).then(() => {
      if (cancelled) return;
      setVehicles((prev) =>
        sortVehiclesByUrgency(
          prev.map((vehicle) =>
            vehicle.id === selectedId ? { ...vehicle, ...patch } : vehicle,
          ),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, selected, documents]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    function onChange(e: MediaQueryListEvent) {
      setIsTablet(e.matches);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    function onOpenVehicle(e: Event) {
      const { vehicleId } = (e as CustomEvent).detail;
      setSelectedId(vehicleId);
      setView("detail");
    }
    window.addEventListener("carcontrol:open-vehicle", onOpenVehicle);
    return () => window.removeEventListener("carcontrol:open-vehicle", onOpenVehicle);
  }, []);

  async function afterVehicleSave(vehicleId: string, data: Partial<Vehicle>) {
    const full = vehicles.find((v) => v.id === vehicleId);
    if (!full) return;
    const updated = { ...full, ...data } as Vehicle;

    if (updated.localNotifications) {
      await scheduleVehicleNotifications(updated);
    } else {
      await cancelVehicleNotifications(vehicleId);
    }

    if (updated.calendarSync) {
      const eventIds = await syncVehicleToCalendar(updated);
      if (Object.keys(eventIds).length > 0) {
        await updateVehicle(vehicleId, { calendarEventIds: eventIds });
      }
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-black/50">
        Cargando…
      </div>
    );
  }

  if (!user) return <LoginView />;

  const unread = getUnreadCount(notifications);

  function openDetail(v: Vehicle) {
    setSelectedId(v.id);
    setView("detail");
    setSelectedDocId(null);
  }

  async function handleCreate(
    data: Partial<Vehicle>,
    cardFile?: File | null,
    cardFields?: VehicleCardFields | null,
  ) {
    if (!user) return;
    const prefs = await getUserPreferences(user.uid);
    const id = await createVehicle(user.uid, {
      plate: data.plate?.trim().toUpperCase() || "PENDIENTE",
      state: data.state || "CDMX",
      alias: data.alias,
      brand: data.brand,
      modelYear: data.modelYear,
      niv: data.niv,
      cylinders: data.cylinders,
      ownerName: data.ownerName,
      cardIssueDate: data.cardIssueDate,
      cardExpiryDate: data.cardExpiryDate,
      verificationDate: data.verificationDate,
      tenenciaDate: data.tenenciaDate,
      refrendoDate: data.refrendoDate,
      serviceDate: data.serviceDate,
      serviceKm: data.serviceKm,
      vehicleType: data.vehicleType ?? "auto",
      reminderDays: data.reminderDays ?? prefs.defaultReminderDays,
      localNotifications: data.localNotifications ?? prefs.localNotifications,
      calendarSync: data.calendarSync ?? prefs.calendarSync,
      includeInEmail: data.includeInEmail ?? true,
    });

    if (cardFile) {
      try {
        await uploadCardDocument(user.uid, id, cardFile, {
          ...(cardFields ?? {}),
          fecha_expedicion: data.cardIssueDate,
          fecha_vencimiento: data.cardExpiryDate,
        });
      } catch (err) {
        console.error("uploadCardDocument failed:", err);
      }
    }

    await loadVehicles();
    const list = await listVehicles(user.uid);
    const created = list.find((v) => v.id === id);
    if (created) {
      try {
        await afterVehicleSave(id, created);
      } catch (err) {
        console.error("afterVehicleSave failed:", err);
      }
    }

    setSelectedId(null);
    setView("home");
  }

  async function handleVehiclePatch(vehicleId: string, patch: Partial<Vehicle>) {
    await updateVehicle(vehicleId, patch);
    const current = vehicles.find((v) => v.id === vehicleId);
    if (current) {
      await afterVehicleSave(vehicleId, { ...current, ...patch });
    }
    setVehicles((prev) =>
      sortVehiclesByUrgency(
        prev.map((v) => (v.id === vehicleId ? { ...v, ...patch } : v)),
      ),
    );
  }

  async function handleUpsertDocument(
    vehicleId: string,
    docId: string | undefined,
    type: DocumentType,
    displayName: string,
    fields: Record<string, string | number | null>,
  ) {
    if (!user) return;
    await upsertManualDocument(user.uid, vehicleId, type, displayName, fields, docId);
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    await cancelVehicleNotifications(vehicle.id);
    await removeVehicleCalendarEvents(vehicle);
    await deleteVehicle(vehicle);
    await loadVehicles();
    setSelectedId(null);
    setView("home");
  }

  const isEmpty = !loading && vehicles.length === 0;
  const showMasterDetail = isTablet && !isEmpty;

  const detailPanel =
    view === "document" && selectedDoc && selected ? (
      <DocumentDetail
        vehicleId={selected.id}
        document={selectedDoc}
        onBack={() => {
          setSelectedDocId(null);
          setView("detail");
        }}
      />
    ) : view === "form" ? (
      <VehicleForm
        key="new-vehicle"
        isFirstVehicle={isEmpty}
        onSave={handleCreate}
        onCancel={() => setView("home")}
      />
    ) : view === "settings" ? (
      <SettingsView
        userId={user.uid}
        email={user.email}
        onBack={() => setView("home")}
      />
    ) : selected ? (
      <VehicleDetail
        userId={user.uid}
        vehicle={selected}
        rules={rules}
        documents={documents}
        stateNewsAlerts={stateNewsAlerts}
        stateNewsUpdatedAt={stateNewsUpdatedAt}
        insuranceExpiry={resolveInsuranceExpiry(selected, documents)}
        onBack={() => {
          setSelectedId(null);
          setView("home");
        }}
        onUpdateVehicle={(patch) => handleVehiclePatch(selected.id, patch)}
        onUpsertDocument={(docId, type, displayName, fields) =>
          handleUpsertDocument(selected.id, docId, type, displayName, fields)
        }
        onDeleteVehicle={() => handleDeleteVehicle(selected)}
        onSelectDocument={(d) => {
          setSelectedDocId(d.id);
          setView("document");
        }}
      />
    ) : (
      <div className="hidden flex-1 items-center justify-center text-black/40 md:flex">
        Selecciona un vehículo
      </div>
    );

  const hideHeader =
    view === "form" ||
    view === "document" ||
    (view === "settings" && !IS_DEMO_HOSTING);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
      {!hideHeader && (
        <Header
          unreadCount={unread}
          onAlerts={() => setView("alerts")}
          onSettings={() => setView("settings")}
          onBack={view === "detail" ? () => { setSelectedId(null); setView("home"); } : undefined}
          title={view === "detail" && selected ? getVehicleDisplayName(selected) : APP_NAME}
        />
      )}

      {view === "alerts" && (
        <AlertsOverlay
          notifications={notifications}
          onClose={() => setView("home")}
          onSelectVehicle={(id) => {
            setSelectedId(id);
            setView("detail");
          }}
        />
      )}

      {view === "settings" && !showMasterDetail && (
        <SettingsView
          userId={user.uid}
          email={user.email}
          onBack={() => setView("home")}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {(view === "home" || showMasterDetail) && view !== "alerts" && (
          <div
            className={`flex flex-col ${
              showMasterDetail
                ? "w-[300px] shrink-0 border-r border-black/10"
                : isEmpty && view === "home"
                  ? "flex flex-1 w-full items-center justify-center bg-black/[0.02]"
                  : "flex-1"
            }`}
          >
            {loading ? (
              <p className="p-4 text-black/50">Cargando…</p>
            ) : (
              <>
                <div className={showMasterDetail ? "min-h-0 flex-1 overflow-y-auto" : "flex-1"}>
                  <HomeView
                    vehicles={vehicles}
                    insuranceExpiries={insuranceExpiries}
                    onSelect={openDetail}
                    onAdd={() => setView("form")}
                  />
                </div>
                {showMasterDetail && vehicles.length > 0 && (
                  <div className="shrink-0 border-t border-black/10 bg-[var(--surface)] p-3">
                    <ExpiryStatusLegend />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {showMasterDetail && view !== "alerts" && view !== "home" && (
          <div className="flex flex-1 flex-col overflow-hidden">{detailPanel}</div>
        )}

        {!showMasterDetail && view === "detail" && selected && (
          <VehicleDetail
            userId={user.uid}
            vehicle={selected}
            rules={rules}
            documents={documents}
            stateNewsAlerts={stateNewsAlerts}
            stateNewsUpdatedAt={stateNewsUpdatedAt}
            insuranceExpiry={insuranceExpiries[selected.id]}
            onBack={() => {
              setSelectedId(null);
              setView("home");
            }}
            onUpdateVehicle={(patch) => handleVehiclePatch(selected.id, patch)}
            onUpsertDocument={(docId, type, displayName, fields) =>
              handleUpsertDocument(selected.id, docId, type, displayName, fields)
            }
            onDeleteVehicle={() => handleDeleteVehicle(selected)}
            onSelectDocument={(d) => {
              setSelectedDocId(d.id);
              setView("document");
            }}
          />
        )}

        {!showMasterDetail && view === "document" && selectedDoc && selected && (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <DocumentDetail
              vehicleId={selected.id}
              document={selectedDoc}
              onBack={() => {
                setSelectedDocId(null);
                setView("detail");
              }}
            />
          </div>
        )}

        {!showMasterDetail && view === "form" && (
          <div
            className={`flex flex-1 flex-col overflow-hidden ${
              isEmpty ? "items-center bg-black/[0.02]" : ""
            }`}
          >
            <div
              className={`flex flex-1 flex-col overflow-hidden ${
                isEmpty ? "w-full max-w-lg" : "w-full"
              }`}
            >
              <VehicleForm
                key="new-vehicle"
                isFirstVehicle={isEmpty}
                onSave={handleCreate}
                onCancel={() => setView("home")}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
