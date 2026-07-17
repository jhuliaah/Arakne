/** Arakne — Mock crochet patterns and secret search terms. */

import type { Pattern } from "./arakne-types";

export const patterns: Pattern[] = [
  { id: 1, nome: "Ponto Corrente", nivel: "Iniciante", cor: "#e8b4b8", emoji: "🧶", descricao: "A base de todo crochê — laçadas em sequência que formam a corrente inicial." },
  { id: 2, nome: "Ponto Baixo", nivel: "Iniciante", cor: "#b8d8e8", emoji: "🪡", descricao: "Ponto compacto e firme, ideal para bordas e peças estruturadas." },
  { id: 3, nome: "Ponto Alto", nivel: "Intermediário", cor: "#d4e8b8", emoji: "🌿", descricao: "Ponto alto e arejado, cria textura leve para mantas e cachecóis." },
  { id: 4, nome: "Ponto Baixíssimo", nivel: "Iniciante", cor: "#e8d4b8", emoji: "🍃", descricao: "O menor dos pontos — usado para deslocar o trabalho sem altura extra." },
  { id: 5, nome: "Ponto Fantasia", nivel: "Avançado", cor: "#d4b8e8", emoji: "✨", descricao: "Combinação de laçadas e pontos altos que cria um efeito de concha delicado." },
  { id: 6, nome: "Ponto Arakne", nivel: "Especial", cor: "#7c5e3c", emoji: "🕸️", descricao: "Padrão especial da comunidade — disponível apenas para membros ativos." },
];

/** Secret search term that reveals the financial screen. */
export const SECRET_SEARCH = "Ponto Arakne";

/** Second secret term — reveals a decoy catalog with zero financial traces. */
export const DECOY_SEARCH = "Galeria de Padrões";

const decoyPatterns: Pattern[] = [
  { id: 101, nome: "Ponto Voador", nivel: "Intermediário", cor: "#c8e8c8", emoji: "🕊️", descricao: "Laçadas cruzadas que criam um efeito de asas na peça final." },
  { id: 102, nome: "Trança Simples", nivel: "Iniciante", cor: "#e8e0c8", emoji: "🪢", descricao: "Padrão entrelaçado clássico, perfeito para bordas de mantas." },
  { id: 103, nome: "Ponto Pipoca", nivel: "Avançado", cor: "#e8c8e0", emoji: "🌼", descricao: "Múltiplas laçadas em um único ponto formam textura em relevo." },
  { id: 104, nome: "Ponto Leque", nivel: "Intermediário", cor: "#c8d8e8", emoji: "🐚", descricao: "Vários pontos altos no mesmo espaço criam um leque aberto." },
  { id: 105, nome: "Ponto Melado", nivel: "Iniciante", cor: "#f0e0c0", emoji: "🍯", descricao: "Textura densa e quente, ideal para peças de inverno." },
  { id: 106, nome: "Renda Dupla", nivel: "Avançado", cor: "#d0e0f0", emoji: "❄️", descricao: "Trabalho delicado com fios finos, cria renda verdadeira." },
];

export { decoyPatterns };
