/** Arakne — TypeScript interfaces for the main Shakespeare app. */

export interface Usuaria {
  identificador: string;
  codigo_indicacao: string;
  codigo_indicacao_usado: string | null;
  tier: number;
  saldo_devedor: number;
  tier_congelado: boolean;
  padroes_completos: number;
  criado_em: string;
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

export interface ConviteResponse {
  codigo: string;
  link: string;
}

export interface Pattern {
  id: number;
  nome: string;
  nivel: string;
  cor: string;
  emoji: string;
  descricao: string;
}
