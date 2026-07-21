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

export async function createUsuaria(
  pin: string,
  codigoIndicacao?: string,
  npub?: string,
  apelido?: string,
): Promise<Usuaria | null> {
  try {
    const body: Record<string, string> = { pin };
    if (codigoIndicacao) body.codigo_indicacao = codigoIndicacao;
    if (npub) body.npub = npub;
    if (apelido) body.apelido = apelido;
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

/** Atualiza o npub da usuária logada via PATCH /usuarias/me/npub.
 *  Usado pela página de setup da demo para definir o npub da Fundadora
 *  após a geração do par nsec/npub no frontend. */
export async function updateNpub(token: string, npub: string): Promise<Usuaria | null> {
  try {
    const resp = await fetch(`${API_BASE}/usuarias/me/npub`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ npub }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Atualiza o apelido da usuária logada via PATCH /usuarias/me/apelido
 *  (Mudança #7-frontend). A Lane A adiciona o endpoint no backend.
 *  Retorna a usuária atualizada, ou null em falha. */
export async function updateApelido(token: string, apelido: string): Promise<Usuaria | null> {
  try {
    const resp = await fetch(`${API_BASE}/usuarias/me/apelido`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ apelido }),
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
 *  automaticamente quando a dona não indicou ninguém).
 *
 *  `apelido` (Mudança #7-frontend) — apelido da tecelã, retornado pelo
 *  backend (Lane A) quando disponível. Pode ser null/ausente se a
 *  tecelã ainda não definiu apelido; a UI faz fallback para npub
 *  truncado. */
export interface AvalistaRecuperacao {
  id: number;
  usuaria_id: number;
  npub_avaliadora: string;
  ordem: number;
  is_shadow: boolean;
  criado_em: string;
  apelido?: string | null;
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
    const data = (await resp.json()) as { avalistas: AvalistaRecuperacao[] };
    return data.avalistas;
  } catch {
    return null;
  }
}

// ── Recuperação em novo dispositivo (sem auth, por identificador) ──

/** Armazena a share 1 (criptografada com PIN) no backend.
 *  Endpoint: POST /usuarias/me/recovery-share (auth required).
 *  Opção E: T=2 N=2 — o backend guarda 1 share, a convidadora guarda a outra.
 *  @returns true se o backend aceitou (201/200), false caso contrário. */
export async function uploadRecoveryShare(shareBlob: string): Promise<boolean> {
  try {
    const token = await ensureToken();
    if (!token) return false;
    const resp = await fetch(`${API_BASE}/usuarias/me/recovery-share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ share_blob: shareBlob }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Busca a share 1 (criptografada com PIN) do backend.
 *  Endpoint: GET /usuarias/me/recovery-share (auth required).
 *  Retorna o blob base64, ou null se não houver share armazenada (404) ou falhar. */
export async function fetchRecoveryShare(): Promise<string | null> {
  try {
    const token = await ensureToken();
    if (!token) return null;
    const resp = await fetch(`${API_BASE}/usuarias/me/recovery-share`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) return null;
    if (!resp.ok) return null;
    const data = (await resp.json()) as { share_blob: string };
    return data.share_blob;
  } catch {
    return null;
  }
}

/** Busca o npub público de uma usuária pelo identificador (sem auth).
 *
 *  Usado por um novo dispositivo que sabe apenas o identificador da conta
 *  para descobrir o npub da dona e iniciar a recuperação social (Track 4A).
 *  O npub é público por design (chave pública Nostr) — não requer token.
 *
 *  Endpoint: GET /usuarias/by-identificador/{id}/npub
 *  Resposta: { identificador: string, npub: string | null }
 *
 *  @param identificador - identificador opaco da conta da dona
 *  @returns npub bech32 (npub1...), ou null se não encontrado/erro de rede */
export async function getNpubByIdentificador(
  identificador: string,
): Promise<string | null> {
  try {
    const resp = await fetch(
      `${API_BASE}/usuarias/by-identificador/${encodeURIComponent(identificador)}/npub`,
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { identificador: string; npub: string | null };
    return data.npub;
  } catch {
    return null;
  }
}

/** Busca os avalistas de recuperação de uma usuária pelo identificador (sem auth).
 *
 *  Usado por um novo dispositivo para descobrir para quais npubs enviar os
 *  pedidos NIP-59 de recuperação de shares SSSS (Track 4A). Não requer token
 *  — npub é público.
 *
 *  Endpoint: GET /usuarias/by-identificador/{id}/avalistas-recuperacao
 *  Resposta: { avalistas: AvalistaRecuperacao[] }
 *
 *  @param identificador - identificador opaco da conta da dona
 *  @returns array de avalistas (com npub_avaliadora em bech32), ou null se
 *    não encontrado/erro de rede */
export async function getAvalistasByIdentificador(
  identificador: string,
): Promise<AvalistaRecuperacao[] | null> {
  try {
    const resp = await fetch(
      `${API_BASE}/usuarias/by-identificador/${encodeURIComponent(identificador)}/avalistas-recuperacao`,
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { avalistas: AvalistaRecuperacao[] };
    return data.avalistas;
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
  npub?: string,
  apelido?: string,
): Promise<Usuaria | null> {
  // Se o caller não passou npub explicitamente, tenta ler do localStorage
  // (a identidade Nostr já deve ter sido criada por createAndStoreIdentity).
  const npubFinal = npub ?? getStoredNpub() ?? undefined;
  const usuaria = await createUsuaria(pin, inviteCodigo ?? undefined, npubFinal, apelido);
  if (!usuaria) return null;

  setIdentificador(usuaria.identificador);
  setPin(pin);

  // Login imediato para obter token (mantém ensureToken funcionando).
  const loginResp = await login(usuaria.identificador, pin);
  if (loginResp) setToken(loginResp.token);

  // Se o backend não aceitou `apelido` no POST (schema antigo), tenta
  // novamente via PATCH /usuarias/me/apelido (best-effort — não falha
  // a criação da conta se o endpoint ainda não existir).
  if (apelido && loginResp) {
    await updateApelido(loginResp.token, apelido);
  }

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
    // Envia o token (se houver) para que o backend retorne o progresso
    // da usuária logada — sem token, `aulas_concluidas` vem sempre 0.
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${API_BASE}/trilhas${qs ? "?" + qs : ""}`, { headers });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function getTrilha(id: number): Promise<TrilhaDetail | null> {
  try {
    // Envia o token (se houver) para que o backend retorne o progresso
    // da usuária logada (aulas concluídas + níveis desbloqueados). Sem
    // token, o backend trata como anônima e tudo aparece como não
    // concluído/trancado — o progresso salvo via `concluirAula` ficaria
    // invisível ao voltar para a TrilhaDetailPage.
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${API_BASE}/trilhas/${id}`, { headers });
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
