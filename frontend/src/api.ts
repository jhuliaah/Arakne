/** API client — all fetch calls to the Arakne backend go through here. */

import type { Emprestimo, LoginResponse, PagamentoResponse, Usuaria } from "./types";

const API_BASE = "/api";

// ── Storage helpers ──────────────────────────────────────────

const STORAGE_KEYS = {
  identificador: "arakne_identificador",
  pin: "arakne_pin",
  token: "arakne_token",
  emprestimos: "arakne_emprestimo_ids",
  avalCodigos: "arakne_aval_codigos",
  onboardingDone: "arakne_onboarding_done",
} as const;

export function getIdentificador(): string | null {
  return localStorage.getItem(STORAGE_KEYS.identificador);
}

export function setIdentificador(id: string): void {
  localStorage.setItem(STORAGE_KEYS.identificador, id);
}

export function getPin(): string | null {
  return localStorage.getItem(STORAGE_KEYS.pin);
}

export function setPin(pin: string): void {
  localStorage.setItem(STORAGE_KEYS.pin, pin);
}

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.token, token);
}

export function getEmprestimoIds(): number[] {
  const raw = localStorage.getItem(STORAGE_KEYS.emprestimos);
  return raw ? JSON.parse(raw) as number[] : [];
}

export function addEmprestimoId(id: number): void {
  const ids = getEmprestimoIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(STORAGE_KEYS.emprestimos, JSON.stringify(ids));
  }
}

export function isAvalCreated(codigo: string): boolean {
  const raw = localStorage.getItem(STORAGE_KEYS.avalCodigos);
  const codigos: string[] = raw ? JSON.parse(raw) : [];
  return codigos.includes(codigo);
}

export function markAvalCreated(codigo: string): void {
  const raw = localStorage.getItem(STORAGE_KEYS.avalCodigos);
  const codigos: string[] = raw ? JSON.parse(raw) : [];
  if (!codigos.includes(codigo)) {
    codigos.push(codigo);
    localStorage.setItem(STORAGE_KEYS.avalCodigos, JSON.stringify(codigos));
  }
}

// ── Random PIN generator ────────────────────────────────────

export function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ── API calls ───────────────────────────────────────────────

export async function createUsuaria(pin: string, codigoIndicacao?: string): Promise<Usuaria | null> {
  try {
    const body: Record<string, string> = { pin };
    if (codigoIndicacao) body.codigo_indicacao = codigoIndicacao;
    const resp = await fetch(`${API_BASE}/usuarias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function createAval(avalistaCodigoIndicacao: string, novaIdentificador: string): Promise<boolean> {
  try {
    const resp = await fetch(`${API_BASE}/avais`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avalista_codigo_indicacao: avalistaCodigoIndicacao,
        nova_usuaria_identificador: novaIdentificador,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function login(identificador: string, pin: string): Promise<LoginResponse | null> {
  try {
    const resp = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador, pin }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function getMe(token: string): Promise<Usuaria | null> {
  try {
    const resp = await fetch(`${API_BASE}/usuarias/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function createEmprestimo(identificador: string): Promise<Emprestimo | null> {
  try {
    const resp = await fetch(`${API_BASE}/emprestimos/${identificador}`, {
      method: "POST",
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function pagarEmprestimo(id: number, valorSats: number): Promise<PagamentoResponse | null> {
  try {
    const resp = await fetch(`${API_BASE}/emprestimos/${id}/pagamento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor_sats: valorSats }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function getEmprestimo(id: number): Promise<Emprestimo | null> {
  try {
    const resp = await fetch(`${API_BASE}/emprestimos/${id}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Composite helpers ───────────────────────────────────────

/** Ensure a token exists — login if needed. Returns token or null. */
export async function ensureToken(): Promise<string | null> {
  const existing = getToken();
  if (existing) {
    // Verify the token still works
    const me = await getMe(existing);
    if (me) return existing;
    // Token expired — clear and re-login
    localStorage.removeItem(STORAGE_KEYS.token);
  }

  const ident = getIdentificador();
  const pin = getPin();
  if (!ident || !pin) return null;

  const loginResp = await login(ident, pin);
  if (!loginResp) return null;

  setToken(loginResp.token);
  return loginResp.token;
}

/**
 * Ensure the user is onboarded: creates a "shadow avalista" + the real user
 * + an aval (tier 0→1) if not already done. All silent — no UI interaction.
 *
 * For the invite flow (/convite/{codigo}), the codigo is the avalista's
 * codigo_indicacao — the shadow avalista is NOT created (the inviter is the
 * avalista). This function is only for the self-onboarding flow (visiting /
 * without an invite).
 */
export async function ensureOnboarding(inviteCodigo?: string | null): Promise<boolean> {
  // Already onboarded?
  if (localStorage.getItem(STORAGE_KEYS.onboardingDone) === "1") {
    return true;
  }

  try {
    // If we have an invite code, the inviter is the avalista.
    // Otherwise, create a shadow avalista to simulate the aval.
    let avalistaCodigo: string | null = inviteCodigo ?? null;

    // Ensure the real user exists
    let ident = getIdentificador();
    let pin = getPin();

    if (!ident || !pin) {
      pin = generatePin();
      const usuaria = await createUsuaria(pin);
      if (!usuaria) return false;
      ident = usuaria.identificador;
      setIdentificador(ident);
      setPin(pin);

      // If no invite, create a shadow avalista
      if (!avalistaCodigo && !isAvalCreated("self")) {
        const shadowPin = generatePin();
        const shadow = await createUsuaria(shadowPin);
        if (!shadow) return false;
        avalistaCodigo = shadow.codigo_indicacao;
      }

      // Create the aval (avalista → real user → tier 0→1)
      if (avalistaCodigo) {
        const ok = await createAval(avalistaCodigo, ident);
        if (ok) {
          markAvalCreated(inviteCodigo ?? "self");
        }
      }
    } else {
      // User exists — ensure aval exists
      if (!inviteCodigo && !isAvalCreated("self")) {
        // Need a shadow avalista
        const shadowPin = generatePin();
        const shadow = await createUsuaria(shadowPin);
        if (shadow) {
          const ok = await createAval(shadow.codigo_indicacao, ident);
          if (ok) markAvalCreated("self");
        }
      } else if (inviteCodigo && !isAvalCreated(inviteCodigo)) {
        const ok = await createAval(inviteCodigo, ident);
        if (ok) markAvalCreated(inviteCodigo);
      }
    }

    localStorage.setItem(STORAGE_KEYS.onboardingDone, "1");
    return true;
  } catch {
    return false;
  }
}
