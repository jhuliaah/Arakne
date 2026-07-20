/** pattern-storage — funções de alto nível para persistir/destravar a
 *  identidade Nostr no dispositivo, usando o padrão hexagonal como senha.
 *
 *  localStorage keys (prefixo arakne_*, conforme convenção de api.ts):
 *  - arakne_nsec_encrypted — blob base64 (salt + iv + ciphertext)
 *  - arakne_pattern_hash   — hash hex do padrão (check rápido antes do PBKDF2)
 *  - arakne_npub           — npub em plaintext (é pública, pode guardar)
 *
 *  O nsec é gerado direto (32 bytes aleatórios) — não há mais mnemonic.
 *  O nsec decriptado fica em memória apenas durante a sessão destravada.
 *  O nsec em plaintext NUNCA vai ao backend. O npub é o identificador de
 *  backup (anotado em QR/papel) e a recuperação é social (NIP-17/59 + SSSS).
 */

import { getPublicKey } from "nostr-tools/pure";
import * as nip19 from "nostr-tools/nip19";
import {
  type NostrIdentity,
  createNostrIdentity,
  decodeNsec,
  encodeNsec,
  bytesToHex,
} from "./nostr-keys";
import {
  encryptNsec,
  decryptNsec,
  hashPattern,
} from "./pattern-crypto";

const STORAGE_KEYS = {
  nsecEncrypted: "arakne_nsec_encrypted",
  patternHash: "arakne_pattern_hash",
  npub: "arakne_npub",
} as const;

/**
 * Contador de tentativas falhas do Ponto Arakne (§5.2 — "pernas da aranha").
 * Persistido em localStorage para sobreviver a recargas/fechamento do app.
 * Quando atinge MAX_ATTEMPTS, o Ponto trava: deixa de funcionar como
 * credencial e a UI passa a exibir um ponto de crochê genérico, sem
 * indício de que ali existia uma credencial financeira.
 */
const LS_FAILED_ATTEMPTS = "arakne_failed_attempts";

/** Limite de tentativas (8 = "pernas da aranha"). §5.2 do documento mestre. */
export const MAX_ATTEMPTS = 8;

/** Lê o contador de tentativas falhas (0 se ausente). */
export function getFailedAttempts(): number {
  const raw = localStorage.getItem(LS_FAILED_ATTEMPTS);
  if (raw === null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Incrementa e retorna o novo contador de tentativas falhas. */
export function incrementFailedAttempts(): number {
  const next = getFailedAttempts() + 1;
  localStorage.setItem(LS_FAILED_ATTEMPTS, String(next));
  return next;
}

/** Zera o contador de tentativas falhas (login/cadastro/recuperação OK). */
export function resetFailedAttempts(): void {
  localStorage.setItem(LS_FAILED_ATTEMPTS, "0");
}

/** Retorna true se o Ponto Arakne está travado (tentativas >= MAX_ATTEMPTS). */
export function isLockedOut(): boolean {
  return getFailedAttempts() >= MAX_ATTEMPTS;
}

/**
 * No cadastro: gera identidade Nostr (nsec direto), criptografa nsec com o
 * padrão, guarda tudo no localStorage.
 * @returns NostrIdentity (nsec, npub, etc.) — o caller usa o npub como
 *          identificador de backup (QR/papel).
 */
export async function createAndStoreIdentity(
  pattern: number[],
): Promise<NostrIdentity> {
  const identity = createNostrIdentity();
  const nsecBytes = decodeNsec(identity.nsec);
  const blob = await encryptNsec(nsecBytes, pattern);
  const hash = await hashPattern(pattern);
  localStorage.setItem(STORAGE_KEYS.nsecEncrypted, blob);
  localStorage.setItem(STORAGE_KEYS.patternHash, hash);
  localStorage.setItem(STORAGE_KEYS.npub, identity.npub);
  return identity;
}

/**
 * No login: tenta destravar o nsec com o padrão.
 * @returns NostrIdentity se sucesso, null se padrão errado
 */
export async function unlockWithPattern(
  pattern: number[],
): Promise<NostrIdentity | null> {
  const blob = localStorage.getItem(STORAGE_KEYS.nsecEncrypted);
  if (!blob) return null;

  // Check rápido: se o hash do padrão não bate, nem tenta PBKDF2
  // (economiza ~500ms de derivação). O hash NÃO é seguro contra brute-force
  // (sem salt, sem KDF) — a segurança real vem do PBKDF2 no decryptNsec.
  const storedHash = localStorage.getItem(STORAGE_KEYS.patternHash);
  if (storedHash !== null) {
    const attemptHash = await hashPattern(pattern);
    if (attemptHash !== storedHash) return null;
  }

  const nsecBytes = await decryptNsec(blob, pattern);
  if (nsecBytes === null) return null;

  // Reconstrói a NostrIdentity a partir dos bytes destravados.
  // npub é re-derivado do nsec (não depende do localStorage — mais robusto).
  const nsec = encodeNsec(nsecBytes);
  const privateKeyHex = bytesToHex(nsecBytes);
  const publicKeyHex = getPublicKey(nsecBytes);
  const npub = nip19.npubEncode(publicKeyHex);

  return {
    nsec,
    npub,
    privateKeyHex,
    publicKeyHex,
  };
}

/**
 * Verifica se há uma identidade armazenada (sem destravar).
 */
export function hasStoredIdentity(): boolean {
  return localStorage.getItem(STORAGE_KEYS.nsecEncrypted) !== null;
}

/**
 * Retorna o npub armazenado (plaintext — é público) ou null se não houver.
 * Útil para enviar ao backend como identificador Nostr da usuária.
 */
export function getStoredNpub(): string | null {
  return localStorage.getItem(STORAGE_KEYS.npub);
}

/**
 * Limpa tudo (logout/reset).
 */
export function clearStoredIdentity(): void {
  localStorage.removeItem(STORAGE_KEYS.nsecEncrypted);
  localStorage.removeItem(STORAGE_KEYS.patternHash);
  localStorage.removeItem(STORAGE_KEYS.npub);
}

/**
 * Adota um nsec recuperado (via recuperação social) + novo padrão.
 * Re-criptografa o nsec com o novo padrão e guarda no localStorage.
 * Usado após `tryCombineShares` retornar o nsec reconstruído.
 *
 * Cenário: a usuária perdeu o aparelho (ou esqueceu o padrão), fez a
 * recuperação social em um dispositivo novo (juntou 2 shares via NIP-59),
 * reconstruiu o nsec original e agora desenha um NOVO Ponto Arakne para
 * re-criptografá-lo neste dispositivo. O npub derivado é o mesmo de
 * antes (a chave privada é a original) — só a senha (padrão) muda.
 *
 * @param recoveredNsec - bytes do nsec reconstruído (32 bytes)
 * @param newPattern - novo padrão hexagonal desenhado pela usuária
 * @returns NostrIdentity (com npub derivado do nsec recuperado)
 */
export async function adoptRecoveredIdentity(
  recoveredNsec: Uint8Array,
  newPattern: number[],
): Promise<NostrIdentity> {
  // 1. Valida o tamanho do nsec (32 bytes — padrão Nostr).
  if (recoveredNsec.length !== 32) {
    throw new Error(
      `adoptRecoveredIdentity: nsec recuperado tem ${recoveredNsec.length} bytes, ` +
        `esperado 32. Shares inválidas ou adulteradas.`,
    );
  }

  // 2. Deriva npub do nsec recuperado (a chave pública é determinística).
  const publicKeyHex = getPublicKey(recoveredNsec);
  const npub = nip19.npubEncode(publicKeyHex);

  // 3. Re-criptografa o nsec com o novo padrão (PBKDF2 + AES-GCM).
  const blob = await encryptNsec(recoveredNsec, newPattern);

  // 4. Hash do novo padrão (check rápido antes do PBKDF2 no próximo login).
  const hash = await hashPattern(newPattern);

  // 5. Guarda no localStorage — sobrescreve qualquer identidade anterior
  //    (pode haver um nsec de conta antiga neste aparelho; a recuperação
  //    substitui pela identidade recém-reconstruída).
  localStorage.setItem(STORAGE_KEYS.nsecEncrypted, blob);
  localStorage.setItem(STORAGE_KEYS.patternHash, hash);
  localStorage.setItem(STORAGE_KEYS.npub, npub);

  // 6. Reconstrói a NostrIdentity para o caller (sem mnemonic — Fase 1B).
  const nsec = encodeNsec(recoveredNsec);
  const privateKeyHex = bytesToHex(recoveredNsec);

  return {
    nsec,
    npub,
    privateKeyHex,
    publicKeyHex,
  };
}
