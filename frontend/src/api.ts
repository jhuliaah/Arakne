/** API client — all fetch calls to the Arakne backend go through here. */

import type { ConcluirAulaResponse, Emprestimo, LoginResponse, PagamentoResponse, PontoDeTroca, Trilha, TrilhaDetail, Troca, Usuaria } from "./types";
import { getStoredNpub } from "./lib/pattern-storage";

const API_BASE = "/api";

// ── Storage helpers ──────────────────────────────────────────

const STORAGE_KEYS = {
  identificador: "arakne_identificador",
  pin: "arakne_pin",
  token: "arakne_token",
  emprestimos: "arakne_emprestimo_ids",
  avalCodigos: "arakne_aval_codigos",
  onboardingDone: "arakne_onboarding_done",
  nickname: "arakne_nickname",
} as const;

const SESSION_UNLOCKED_KEY = "arakne_unlocked";

export function getNickname(): string | null {
  return localStorage.getItem(STORAGE_KEYS.nickname);
}

export function setNickname(nome: string): void {
  localStorage.setItem(STORAGE_KEYS.nickname, nome);
}

/** True se o PIN já foi confirmado nesta aba/sessão do navegador
 *  (sessionStorage é limpo ao fechar a aba — reabrir pede o PIN de novo). */
export function isUnlockedThisSession(): boolean {
  return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "1";
}

export function markUnlockedThisSession(): void {
  sessionStorage.setItem(SESSION_UNLOCKED_KEY, "1");
}

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

/** Limpa tudo do dispositivo — identificador, token, apelido, histórico
 *  local de fios/avais e a sessão desbloqueada. Não afeta a conta no
 *  backend; a usuária pode recuperar depois com a frase de segurança. */
export function logout(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
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

export async function createUsuaria(pin: string, codigoIndicacao?: string, npub?: string): Promise<Usuaria | null> {
  try {
    const body: Record<string, string> = { pin };
    if (codigoIndicacao) body.codigo_indicacao = codigoIndicacao;
    if (npub) body.npub = npub;
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

// ── Convite (invite link) ──────────────────────────────────

export interface ConviteResponse {
  codigo: string;
  link: string;
}

export async function getConvite(token: string): Promise<ConviteResponse | null> {
  try {
    const resp = await fetch(`${API_BASE}/usuarias/me/convite`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Ponto de Troca ("Fornecedora de Linha") ──────────────────

export async function listarPontosDeTroca(token: string): Promise<PontoDeTroca[] | null> {
  try {
    const resp = await fetch(`${API_BASE}/pontos-de-troca`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Retorna null em erro de rede, ou {ok, disponivel?} — ok=false quando o
 *  backend recusou (ex.: tier insuficiente para se tornar um Ponto de Troca). */
export async function setDisponibilidadePonto(
  token: string,
  disponivel: boolean
): Promise<{ ok: boolean; disponivel?: boolean }> {
  try {
    const resp = await fetch(`${API_BASE}/pontos-de-troca/disponibilidade`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ disponivel }),
    });
    if (!resp.ok) return { ok: false };
    const data = await resp.json();
    return { ok: true, disponivel: data.disponivel };
  } catch {
    return { ok: false };
  }
}

export async function criarTroca(
  token: string,
  pontoIdentificador: string,
  valorSats: number
): Promise<Troca | null> {
  try {
    const resp = await fetch(`${API_BASE}/trocas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ponto_identificador: pontoIdentificador,
        valor_sats: valorSats,
      }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function getMinhasTrocas(token: string): Promise<Troca[] | null> {
  try {
    const resp = await fetch(`${API_BASE}/trocas/minhas`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Avalistas de recuperação (social backup via Nostr) ───────

/** Avalista de recuperação retornado pelo backend: cada uma das 3
 *  tecelãs de confiança que guardam um shard do nsec da dona. O campo
 *  `is_shadow` marca as tecelãs-sombra (placeholder com npub gerado
 *  automaticamente quando a dona não indicou ninguém). */
export interface AvalistaRecuperacao {
  id: number;
  usuaria_id: number;
  npub_avaliadora: string;
  ordem: number;
  is_shadow: boolean;
  criado_em: string;
}

/** Busca os 3 avalistas de recuperação da usuária logada.
 *  Retorna null em erro de rede ou se o endpoint não existir ainda
 *  (Track 3B cuida do backend — o frontend já está pronto para
 *  consumir). */
export async function getAvalistasRecuperacao(
  token: string
): Promise<AvalistaRecuperacao[] | null> {
  try {
    const resp = await fetch(`${API_BASE}/usuarias/me/avalistas-recuperacao`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
 * Fluxo de recuperação: recebe {identificador, pin} já decodificados da
 * frase de segurança, confirma com o backend via /login e, se válido,
 * adota essa conta neste dispositivo (útil tanto para "esqueci meu PIN"
 * quanto para restaurar a conta em um aparelho novo).
 */
export async function recuperarConta(
  identificador: string,
  pin: string
): Promise<boolean> {
  const resp = await login(identificador, pin);
  if (!resp) return false;
  setIdentificador(identificador);
  setToken(resp.token);
  localStorage.setItem(STORAGE_KEYS.onboardingDone, "1");
  return true;
}

/**
 * Cria a conta real (identificador + PIN aleatório interno, nunca mostrado
 * à usuária) e garante que ela nasça com um aval válido (tier 0 → 1):
 *  - se veio de um link de convite, quem convidou é a avalista;
 *  - caso contrário, criamos uma "avalista sombra" só para liberar o
 *    primeiro nível — invisível para a usuária, não aparece em lugar nenhum.
 *
 * Já faz login e guarda token + PIN internamente, para que o ensureToken
 * das telas financeiras funcione sem depender de um passo de "backup"
 * que faça login (o novo onboarding não tem esse passo).
 */
export async function criarConta(
  pin: string,
  inviteCodigo?: string | null,
  npub?: string
): Promise<Usuaria | null> {
  // Se o caller não passou npub explicitamente, tenta ler do localStorage
  // (a identidade Nostr já deve ter sido criada por createAndStoreIdentity).
  const npubFinal = npub ?? getStoredNpub() ?? undefined;
  const usuaria = await createUsuaria(pin, inviteCodigo ?? undefined, npubFinal);
  if (!usuaria) return null;

  setIdentificador(usuaria.identificador);
  setPin(pin);

  // Login imediato para obter token (mantém ensureToken funcionando).
  const loginResp = await login(usuaria.identificador, pin);
  if (loginResp) setToken(loginResp.token);

  if (inviteCodigo) {
    markAvalCreated(inviteCodigo);
  } else if (!isAvalCreated("self")) {
    const shadowPin = generatePin();
    const shadow = await createUsuaria(shadowPin);
    if (shadow) {
      const ok = await createAval(shadow.codigo_indicacao, usuaria.identificador);
      if (ok) markAvalCreated("self");
    }
  }

  localStorage.setItem(STORAGE_KEYS.onboardingDone, "1");
  return usuaria;
}

// ── Trilhas de conhecimento (camada de disfarce) ──────────
// Educacional apenas — sem acoplamento financeiro.

export async function listarTrilhas(tecnica?: string, estilo?: string): Promise<Trilha[] | null> {
  try {
    const params = new URLSearchParams();
    if (tecnica) params.set("tecnica", tecnica);
    if (estilo) params.set("estilo", estilo);
    const qs = params.toString();
    const resp = await fetch(`${API_BASE}/trilhas${qs ? "?" + qs : ""}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function getTrilha(id: number): Promise<TrilhaDetail | null> {
  try {
    const resp = await fetch(`${API_BASE}/trilhas/${id}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function concluirAula(aulaId: number): Promise<ConcluirAulaResponse | null> {
  try {
    const token = await ensureToken();
    if (!token) return null;
    const resp = await fetch(`${API_BASE}/trilhas/aulas/${aulaId}/concluir`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
