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

// ── Inscrição/início de trilhas e aulas (BUG 3) ─────────────
// Educacional apenas — sem acoplamento financeiro.

/** Resposta de `POST /trilhas/{trilha_id}/inscrever` — cria
 *  ProgressoAula(concluida=False) para cada aula sem registro prévio.
 *  Idempotente: inscrever de novo retorna `ja_inscritas = total_aulas`. */
export interface InscreverTrilhaResponse {
  trilha_id: number;
  aulas_inscritas: number;
  ja_inscritas: number;
  total_aulas: number;
}

/** Resposta de `POST /trilhas/aulas/{aula_id}/iniciar` — cria
 *  ProgressoAula para uma aula específica. Idempotente. */
export interface IniciarAulaResponse {
  aula_id: number;
  iniciada_agora: boolean;
  concluida: boolean;
}

// ── Pix (Mercado Pago) e custódia multisig ─────────────────
// Repagamento via dinheiro bancário (fora do app) e reserva fria.

// Cobrança Pix gerada pelo backend (POST /pix/emprestimos/{id}/cobranca).
// Na UI aparece como "concluir o padrão" — nunca como fatura.
export interface CobrancaPix {
  txid: string;
  mp_payment_id: string | null;
  status: string; // "pendente" | "aprovado" | "expirado"
  qr_code: string; // copia-e-cola (linha Pix)
  qr_code_base64: string; // imagem QR em base64 (pode ser vazia em mock)
  ticket_url: string;
  valor_sats: number;
  valor_centavos_brl: number;
}

// Status de um pagamento Pix (GET /pix/pagamentos/{txid}).
// Consulta só o DB local — não chama o Mercado Pago.
export interface StatusPagamentoPix {
  id: number;
  emprestimo_id: number;
  txid: string;
  status: string; // "pendente" | "aprovado" | "expirado"
  valor_sats: number;
  valor_centavos_brl: number;
  criado_em: string;
  confirmado_em: string | null;
}

// Custódia multisig (GET /custodia/reserva-fria) — união de dois schemas
// do backend (CustodiaMultisigResponse | CustodiaMultisigVazia).
export interface CustodiaReservaFria {
  configurado: boolean;
  // Presentes só se configurado=true:
  descriptor?: string;
  endereco?: string;
  quorum?: string; // ex: "2-de-3"
  total_signatarios?: number;
  network?: string; // "regtest" | "testnet" | "signet" | "mainnet"
  criado_em?: string;
  // Presente só se configurado=false:
  mensagem?: string;
}
