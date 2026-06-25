"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/AppLogo";
import { CalcomaniaBadge } from "@/components/CalcomaniaBadge";
import { APP_NAME } from "@/config/app";
import {
  clearAdminSecret,
  fetchCasinClients,
  formatVehicleLabel,
  getStoredAdminSecret,
  storeAdminSecret,
  type CasinClientRow,
} from "@/lib/casin-admin";

export function AdminPanel() {
  const router = useRouter();
  const [secretInput, setSecretInput] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<CasinClientRow[]>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadClients = useCallback(async (secret: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const rows = await fetchCasinClients(secret);
      setClients(rows);
      setAuthorized(true);
      storeAdminSecret(secret);
      setExpanded((current) => {
        const next = { ...current };
        for (const client of rows) {
          if (next[client.userId] === undefined) {
            next[client.userId] = true;
          }
        }
        return next;
      });
    } catch (err) {
      setAuthorized(false);
      clearAdminSecret();
      setClients([]);
      setError(
        err instanceof Error ? err.message : "No se pudo cargar la lista",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (!stored) {
      setLoading(false);
      return;
    }
    void loadClients(stored);
  }, [loadClients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((client) => {
      const name = client.clientName.toLowerCase();
      const email = client.email?.toLowerCase() ?? "";
      const vehicleText = client.vehicles
        .map((vehicle) => formatVehicleLabel(vehicle).toLowerCase())
        .join(" ");
      return name.includes(q) || email.includes(q) || vehicleText.includes(q);
    });
  }, [clients, query]);

  const totalVehicles = useMemo(
    () => clients.reduce((sum, client) => sum + client.vehicles.length, 0),
    [clients],
  );

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    const secret = secretInput.trim();
    if (!secret) {
      setError("Ingresa la clave de administrador");
      return;
    }
    await loadClients(secret);
  }

  function handleLogout() {
    clearAdminSecret();
    setAuthorized(false);
    setClients([]);
    setSecretInput("");
    setQuery("");
    setError(null);
    setExpanded({});
  }

  async function handleCopyLink(client: CasinClientRow) {
    try {
      await navigator.clipboard.writeText(client.link);
      setCopiedToken(client.token);
      window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setError("No se pudo copiar el enlace");
    }
  }

  function openSession(client: CasinClientRow) {
    if (client.revoked) return;
    router.push(`/acceso/${client.token}/`);
  }

  function toggleClient(userId: string) {
    setExpanded((current) => ({
      ...current,
      [userId]: !current[userId],
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-black/50">Cargando directorio…</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-10">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <AppLogo size="md" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin {APP_NAME}</h1>
          <p className="mt-2 max-w-sm text-[15px] text-black/50">
            Directorio de clientes y sus autos.
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="password"
            value={secretInput}
            onChange={(event) => setSecretInput(event.target.value)}
            placeholder="Clave de administrador"
            className="field-input"
            autoComplete="current-password"
          />
          <button type="submit" className="btn-primary w-full py-3">
            Entrar
          </button>
        </form>

        {error && (
          <p className="max-w-sm text-center text-sm text-black/70">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--background)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <AppLogo size="sm" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                Clientes {APP_NAME}
              </h1>
              <p className="text-xs text-black/45">
                {clients.length} clientes · {totalVehicles} autos
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const secret = getStoredAdminSecret();
                if (secret) void loadClients(secret, true);
              }}
              disabled={refreshing}
              className="btn-secondary px-3 py-2 disabled:opacity-50"
            >
              {refreshing ? "Actualizando…" : "Actualizar"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary px-3 py-2"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar cliente, email o auto…"
          className="field-input mb-4"
        />

        {error && (
          <p className="mb-4 rounded-lg bg-[var(--status-danger-soft)] px-3 py-2 text-sm text-black/75">
            {error}
          </p>
        )}

        <div className="space-y-3">
          {filtered.map((client) => {
            const isOpen = expanded[client.userId] ?? true;
            return (
              <section
                key={client.userId}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-white"
              >
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => toggleClient(client.userId)}
                    className="min-w-0 text-left"
                  >
                    <p className="truncate text-[15px] font-semibold">
                      {isOpen ? "▾" : "▸"} {client.clientName}
                    </p>
                    <p className="truncate text-sm text-black/50">
                      {client.email || "Sin email"} · {client.vehicles.length}{" "}
                      {client.vehicles.length === 1 ? "auto" : "autos"}
                    </p>
                    {client.revoked && (
                      <p className="mt-1 text-xs font-medium text-[var(--status-danger)]">
                        Sesión revocada
                      </p>
                    )}
                  </button>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openSession(client)}
                      disabled={client.revoked}
                      className="btn-primary px-3 py-2 text-sm disabled:opacity-50"
                    >
                      Abrir sesión
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyLink(client)}
                      className="btn-secondary px-3 py-2 text-sm"
                    >
                      {copiedToken === client.token ? "Copiado" : "Copiar link"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--surface-muted)]/40">
                    {client.vehicles.length === 0 ? (
                      <li className="px-4 py-3 text-sm text-black/45">
                        Sin autos asignados.
                      </li>
                    ) : (
                      client.vehicles.map((vehicle) => (
                        <li
                          key={vehicle.id}
                          className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                              {vehicle.alias?.trim() || vehicle.plate}
                              <CalcomaniaBadge
                                plate={vehicle.plate}
                                state={vehicle.state ?? "CDMX"}
                              />
                            </p>
                            <p className="truncate text-xs text-black/45">
                              {vehicle.plate}
                              {vehicle.brand ? ` · ${vehicle.brand}` : ""}
                              {vehicle.modelYear ? ` · ${vehicle.modelYear}` : ""}
                            </p>
                          </div>
                          <p className="text-xs text-black/55">
                            Propietario: {vehicle.ownerName || client.clientName}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-black/45">
            No hay resultados.
          </p>
        )}
      </main>
    </div>
  );
}
