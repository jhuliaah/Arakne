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

export async function createAval(avalistaIdent: string, novaIdent: string): Promise<boolean> {
  try {
    const resp = await fetch(`${API_BASE}/avais`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avalista_identificador: avalistaIdent,
        nova_usuaria_identificador: novaIdent,
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
  if (existing) return existing;

  const ident = getIdentificador();
  const pin = getPin();
  if (!ident || !pin) return null;

  const loginResp = await login(ident, pin);
  if (!loginResp) return null;

  setToken(loginResp.token);
  return loginResp.token;
}
