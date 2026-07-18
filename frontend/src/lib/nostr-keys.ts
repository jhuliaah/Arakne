/** Identidade Nostr no dispositivo — NIP-06 (derivação por mnemônico) + NIP-19 (bech32).
 *
 *  Tudo aqui é 100% local: a chave privada (nsec) NUNCA sai do dispositivo,
 *  nunca é enviada ao backend, nunca é persistida por este módulo. O chamador
 *  decide onde (e se) guarda o nsec — recomendamos encrypt/decrypt antes de
 *  qualquer persistência (Phase 2).
 *
 *  NIP-06: derivação de chave Nostr a partir de mnemônico BIP-39 via BIP-32,
 *  path m/44'/1237'/0'/0/0 (o nostr-tools cuida do path internamente).
 *  NIP-19: codificação bech32 (nsec1... / npub1...).
 */

import {
  generateSeedWords,
  accountFromSeedWords,
  validateWords,
} from "nostr-tools/nip06";
import * as nip19 from "nostr-tools/nip19";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export interface NostrIdentity {
  /** Mnemônico BIP-39 (12 palavras). */
  mnemonic: string;
  /** Chave privada bech32 (nsec1...). NUNCA enviar ao backend. */
  nsec: string;
  /** Chave pública bech32 (npub1...). Pode ser compartilhada. */
  npub: string;
  /** Chave privada em hex (32 bytes / 64 chars). */
  privateKeyHex: string;
  /** Chave pública em hex (32 bytes / 64 chars). */
  publicKeyHex: string;
}

/** Índice de conta padrão do path NIP-06 (m/44'/1237'/0'/0/<accountIndex>). */
const DEFAULT_ACCOUNT_INDEX = 0;

/** passphrase BIP-39 vazia por padrão (a usuária pode passar uma se quiser). */
const DEFAULT_PASSPHRASE = "";

function buildIdentity(
  mnemonic: string,
  passphrase: string,
  accountIndex: number,
): NostrIdentity {
  const { privateKey, publicKey } = accountFromSeedWords(
    mnemonic,
    passphrase,
    accountIndex,
  );
  const privateKeyHex = bytesToHex(privateKey);
  // publicKey já vem em hex no nostr-tools (32 bytes / 64 chars).
  const publicKeyHex = publicKey;
  const nsec = nip19.nsecEncode(privateKey);
  const npub = nip19.npubEncode(publicKeyHex);
  return { mnemonic, nsec, npub, privateKeyHex, publicKeyHex };
}

/** Gera uma nova identidade Nostr: mnemônico → nsec/npub via NIP-06. */
export function createNostrIdentity(): NostrIdentity {
  const mnemonic = generateSeedWords();
  return buildIdentity(mnemonic, DEFAULT_PASSPHRASE, DEFAULT_ACCOUNT_INDEX);
}

/** Restaura identidade a partir de mnemônico existente.
 *
 *  Lança se o mnemônico for inválido (use validateMnemonic antes).
 *  Passar `passphrase` habilita seeds protegidas por senha BIP-39.
 */
export function restoreFromMnemonic(
  mnemonic: string,
  passphrase?: string,
): NostrIdentity {
  if (!validateWords(mnemonic)) {
    throw new Error("Mnemônico inválido (BIP-39).");
  }
  return buildIdentity(
    mnemonic,
    passphrase ?? DEFAULT_PASSPHRASE,
    DEFAULT_ACCOUNT_INDEX,
  );
}

/** Decodifica nsec1... → bytes da chave privada (32 bytes). */
export function decodeNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") {
    throw new Error(`Esperado nsec1..., recebido ${decoded.type}.`);
  }
  return decoded.data;
}

/** Codifica bytes da chave privada → nsec1... */
export function encodeNsec(privateKeyBytes: Uint8Array): string {
  return nip19.nsecEncode(privateKeyBytes);
}

/** Decodifica npub1... → hex da chave pública (64 chars). */
export function decodeNpub(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub") {
    throw new Error(`Esperado npub1..., recebido ${decoded.type}.`);
  }
  return decoded.data;
}

/** Valida mnemônico BIP-39 (palavras + checksum). */
export function validateMnemonic(mnemonic: string): boolean {
  return validateWords(mnemonic);
}

// Re-export utilitário para callers que precisem converter hex ↔ bytes
// sem depender diretamente de @noble/hashes.
export { bytesToHex, hexToBytes };
