/** Arakne — API client for the main Shakespeare app.

  Calls the FastAPI backend at http://localhost:8000 (when running via docker-compose).
  Falls back gracefully when the backend is not available.
*/

import type { ConviteResponse, Emprestimo, LoginResponse, PagamentoResponse, Usuaria } from "./arakne-types";

const API_BASE = "http://localhost:8000";

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
function setIdentificador(id: string): void {
  localStorage.setItem(STORAGE_KEYS.identificador, id);
}
function getPin(): string | null {
  return localStorage.getItem(STORAGE_KEYS.pin);
}
function setPin(pin: string): void {
  localStorage.setItem(STORAGE_KEYS.pin, pin);
}
function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}
function setToken(token: string): void {
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
function isAvalCreated(codigo: string): boolean {
  const raw = localStorage.getItem(STORAGE_KEYS.avalCodigos);
  const codigos: string[] = raw ? JSON.parse(raw) : [];
  return codigos.includes(codigo);
}
function markAvalCreated(codigo: string): void {
  const raw = localStorage.getItem(STORAGE_KEYS.avalCodigos);
  const codigos: string[] = raw ? JSON.parse(raw) : [];
  if (!codigos.includes(codigo)) {
    codigos.push(codigo);
    localStorage.setItem(STORAGE_KEYS.avalCodigos, JSON.stringify(codigos));
  }
}

function generatePin(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ── API calls ───────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, options);
}

export async function createUsuaria(pin: string, codigoIndicacao?: string): Promise<Usuaria | null> {
  try {
    const body: Record<string, string> = { pin };
    if (codigoIndicacao) body.codigo_indicacao = codigoIndicacao;
    const resp = await apiFetch("/usuarias", {
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
    const resp = await apiFetch("/avais", {
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
    const resp = await apiFetch("/login", {
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
    const resp = await apiFetch("/usuarias/me", {
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
    const resp = await apiFetch(`/emprestimos/${identificador}`, { method: "POST" });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function pagarEmprestimo(id: number, valorSats: number): Promise<PagamentoResponse | null> {
  try {
    const resp = await apiFetch(`/emprestimos/${id}/pagamento`, {
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
    const resp = await apiFetch(`/emprestimos/${id}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function getConvite(token: string): Promise<ConviteResponse | null> {
  try {
    const resp = await apiFetch("/usuarias/me/convite", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Composite helpers ───────────────────────────────────────

export async function ensureToken(): Promise<string | null> {
  const existing = getToken();
  if (existing) {
    const me = await getMe(existing);
    if (me) return existing;
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

export async function ensureOnboarding(inviteCodigo?: string | null): Promise<boolean> {
  if (localStorage.getItem(STORAGE_KEYS.onboardingDone) === "1") return true;
  try {
    let avalistaCodigo: string | null = inviteCodigo ?? null;
    let ident = getIdentificador();
    let pin = getPin();

    if (!ident || !pin) {
      pin = generatePin();
      const usuaria = await createUsuaria(pin);
      if (!usuaria) return false;
      ident = usuaria.identificador;
      setIdentificador(ident);
      setPin(pin);

      if (!avalistaCodigo && !isAvalCreated("self")) {
        const shadowPin = generatePin();
        const shadow = await createUsuaria(shadowPin);
        if (!shadow) return false;
        avalistaCodigo = shadow.codigo_indicacao;
      }

      if (avalistaCodigo) {
        const ok = await createAval(avalistaCodigo, ident);
        if (ok) markAvalCreated(inviteCodigo ?? "self");
      }
    } else {
      if (!inviteCodigo && !isAvalCreated("self")) {
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
