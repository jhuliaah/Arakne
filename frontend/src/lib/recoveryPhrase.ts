/** Frase de recuperação — codificação reversível 100% local.
 *
 *  O backend já gera um `identificador` aleatório (14 caracteres, alfabeto
 *  base64url: A-Z a-z 0-9 - _) e a usuária escolhe um PIN de 4 dígitos.
 *  Em vez de guardar esses dois valores em algum lugar novo, nós os
 *  *codificamos* como uma sequência de palavras temáticas de costura —
 *  a "chave de segurança" mostrada na tela de backup.
 *
 *  A frase é decodificável de volta para {identificador, pin} em qualquer
 *  dispositivo, sem precisar de nenhuma rota nova no backend: basta chamar
 *  login(identificador, pin) com o resultado da decodificação.
 *
 *  Posições fixas: as primeiras 14 palavras codificam o identificador
 *  (uma palavra por caractere), as últimas 4 codificam o PIN (uma palavra
 *  por dígito) — reaproveitando o mesmo dicionário, já que dígitos 0-9
 *  também fazem parte do alfabeto do identificador.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// 64 palavras, uma por caractere do alfabeto acima (mesma ordem/índice).
const WORDS = [
  "novelo", "agulha", "lã", "ponto", "trama", "fio", "tricô", "cesto",
  "tear", "linha", "malha", "costura", "retalho", "bainha", "franja", "laço",
  "nó", "carretel", "dedal", "tesoura", "botão", "renda", "crochê", "atadura",
  "fivela", "gancho", "bobina", "meada", "algodão", "lãzinha", "tecelagem", "fuso",
  "roca", "pano", "costureira", "alinhavo", "debrum", "viés", "pesponto", "chuleio",
  "remendo", "tricotar", "tramado", "emenda", "argola", "presilha", "colchete", "ilhós",
  "zíper", "elástico", "forro", "estampa", "xadrez", "listrado", "bordado", "aplique",
  "miçanga", "lantejoula", "franjado", "amarra", "cordão", "barbante", "sisal", "juta",
] as const;

const IDENTIFICADOR_LENGTH = 14;
const PIN_LENGTH = 4;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeWord(w: string): string {
  return stripAccents(w.trim().toLowerCase());
}

// Mapa palavra-normalizada → índice, construído uma vez.
const WORD_TO_INDEX = new Map<string, number>();
WORDS.forEach((w, i) => WORD_TO_INDEX.set(normalizeWord(w), i));

export function encodeRecoveryPhrase(identificador: string, pin: string): string[] {
  const chars = identificador.split("").map((c) => {
    const idx = ALPHABET.indexOf(c);
    // Não deveria acontecer com um identificador gerado pelo backend, mas
    // por segurança caímos num índice válido em vez de quebrar a tela.
    return WORDS[idx === -1 ? 0 : idx];
  });
  const digits = pin.split("").map((d) => {
    const idx = 52 + Number(d); // dígitos 0-9 ocupam os índices 52-61
    return WORDS[Number.isFinite(idx) && idx >= 52 && idx <= 61 ? idx : 52];
  });
  return [...chars, ...digits];
}

export interface DecodedPhrase {
  identificador: string;
  pin: string;
}

/** Retorna null se a frase não tiver o formato esperado (palavra desconhecida, tamanho errado). */
export function decodeRecoveryPhrase(words: string[]): DecodedPhrase | null {
  const cleaned = words.map((w) => w).filter((w) => w.length > 0);
  if (cleaned.length !== IDENTIFICADOR_LENGTH + PIN_LENGTH) return null;

  const indices: number[] = [];
  for (const w of cleaned) {
    const idx = WORD_TO_INDEX.get(normalizeWord(w));
    if (idx === undefined) return null;
    indices.push(idx);
  }

  const identChars = indices.slice(0, IDENTIFICADOR_LENGTH).map((i) => ALPHABET[i]);
  const pinDigits = indices.slice(IDENTIFICADOR_LENGTH).map((i) => {
    if (i < 52 || i > 61) return null;
    return String(i - 52);
  });

  if (pinDigits.some((d) => d === null)) return null;

  return {
    identificador: identChars.join(""),
    pin: pinDigits.join(""),
  };
}

/** Aceita a frase colada como texto livre (separada por espaço, vírgula, "·" ou quebras de linha). */
export function parsePhraseInput(raw: string): string[] {
  return raw
    .split(/[\s,·]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}
