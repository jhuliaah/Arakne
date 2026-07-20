/** TypeScript interfaces for the Arakne frontend. */

export interface Usuaria {
  identificador: string;
  codigo_indicacao: string;
  codigo_indicacao_usado: string | null;
  tier: number;
  saldo_devedor: number;
  tier_congelado: boolean;
  padroes_completos: number;
  disponivel_como_ponto: boolean;
  trocas_como_ponto_concluidas: number;
  criado_em: string;
}

export interface PontoDeTroca {
  identificador: string;
  trocas_como_ponto_concluidas: number;
}

export interface Troca {
  id: number;
  valor_sats: number;
  status: string;
  criado_em: string;
  confirmada_em: string | null;
  papel: "solicitante" | "ponto";
  contraparte_identificador: string;
}

export interface Emprestimo {
  id: number;
  usuaria_id: number;
  valor_sats: number;
  invoice_id: string | null;
  status: string;
  criado_em: string;
  quitado_em: string | null;
  invoice_bolt11?: string;
}

export interface PagamentoResponse {
  emprestimo_id: number;
  valor_pago: number;
  saldo_devedor: number;
  quitado: boolean;
  tier: number;
}

export interface LoginResponse {
  token: string;
  token_type: string;
  identificador: string;
}

export interface Pattern {
  id: number;
  nome: string;
  nivel: string;
  cor: string;
  emoji: string;
  descricao: string;
}

// ── Trilhas de conhecimento (camada de disfarce) ───────────
// Educacional apenas — sem acoplamento financeiro.

export interface Material {
  id: number;
  aula_id: number;
  tipo: "pdf" | "imagem" | "video";
  url: string;
  titulo: string;
  ordem: number;
  legenda: string | null;
  // Campos opcionais para atribuição e metadados (Passo 2 do plano de trilhas).
  licenca?: string | null;
  fonte?: string | null;
  duracao_seg?: number | null;
  thumbnail_url?: string | null;
}

export interface Aula {
  id: number;
  trilha_id: number;
  nivel: number;
  ordem: number;
  titulo: string;
  descricao: string;
  concluida: boolean;
  materiais: Material[];
}

export interface Nivel {
  nivel: number;
  label: string;
  desbloqueado: boolean;
  aulas: Aula[];
}

export interface Trilha {
  id: number;
  titulo: string;
  tecnica: string;
  estilo: string;
  descricao: string;
  emoji: string;
  cor: string;
  ordem: number;
  total_aulas: number;
  aulas_concluidas: number;
}

export interface TrilhaDetail extends Trilha {
  niveis: Nivel[];
}

export interface ConcluirAulaResponse {
  aula_id: number;
  concluida: boolean;
  nivel_completo: boolean;
  trilha_completa: boolean;
}
