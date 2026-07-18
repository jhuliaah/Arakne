/** Smoke test rápido para src/lib/nostr-keys.ts.
 *
 *  Rode com:  npx tsx scripts/test-nostr-keys.ts
 *
 *  Não usa vitest (será configurado na Phase 4). Apenas valida que a API
 *  do nostr-tools (NIP-06 + NIP-19) funciona como esperado no fluxo de
 *  criar/restaurar identidade.
 */

import {
  createNostrIdentity,
  restoreFromMnemonic,
  decodeNsec,
  encodeNsec,
  decodeNpub,
  validateMnemonic,
} from "../src/lib/nostr-keys";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

console.log("1) createNostrIdentity()");
const id = createNostrIdentity();
assert(id.nsec.startsWith("nsec1"), `nsec começa com "nsec1" (veio: ${id.nsec.slice(0, 8)}…)`);
assert(id.npub.startsWith("npub1"), `npub começa com "npub1" (veio: ${id.npub.slice(0, 8)}…)`);
assert(id.mnemonic.split(/\s+/).length === 12, "mnemonic tem 12 palavras");
assert(id.privateKeyHex.length === 64, `privateKeyHex tem 64 chars (veio: ${id.privateKeyHex.length})`);
assert(id.publicKeyHex.length === 64, `publicKeyHex tem 64 chars`);
assert(validateMnemonic(id.mnemonic), "validateMnemonic(mnemonic) === true");

console.log("2) decodeNsec / encodeNsec round-trip");
const privBytes = decodeNsec(id.nsec);
const reEncoded = encodeNsec(privBytes);
assert(reEncoded === id.nsec, "encodeNsec(decodeNsec(nsec)) === nsec");

console.log("3) decodeNpub");
const pubHex = decodeNpub(id.npub);
assert(pubHex === id.publicKeyHex, "decodeNpub(npub) === publicKeyHex");

console.log("4) restoreFromMnemonic determinismo");
const restored = restoreFromMnemonic(id.mnemonic);
assert(restored.nsec === id.nsec, "restored.nsec === original.nsec");
assert(restored.npub === id.npub, "restored.npub === original.npub");
assert(restored.privateKeyHex === id.privateKeyHex, "restored.privateKeyHex === original");

console.log("5) restoreFromMnemonic com passphrase diferente gera chave diferente");
const restoredWithPass = restoreFromMnemonic(id.mnemonic, "arakne");
assert(restoredWithPass.nsec !== id.nsec, "passphrase não-vazia muda o nsec");

console.log("6) restoreFromMnemonic rejeita mnemônico inválido");
try {
  restoreFromMnemonic("foo bar baz qux");
  assert(false, "deveria ter lançado");
} catch (e) {
  assert(/inválido/i.test((e as Error).message), `lançou erro de mnemônico inválido`);
}

console.log("7) validateMnemonic rejeita palavras ruins");
assert(validateMnemonic("foo bar baz") === false, "validateMnemonic('foo bar baz') === false");

console.log();
if (failures === 0) {
  console.log("✅ Todos os checks passaram.");
  process.exit(0);
} else {
  console.error(`❌ ${failures} check(s) falharam.`);
  process.exit(1);
}
