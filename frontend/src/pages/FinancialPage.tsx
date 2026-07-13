/** Financial page — disguised as "Meus Materiais".

  All financial terms are disguised:
  - Empréstimo = "kit de material"
  - Quitação = "padrão concluído"
  - Tier = "nível"
  - Saldo devedor = "materiais em uso"
  - Limite = "materiais disponíveis"
  - Sats = just numbers, no unit
*/

import { useEffect, useState, useCallback } from "react";
import Header from "../components/Header";
import {
  createEmprestimo,
  ensureToken,
  getEmprestimoIds,
  getMe,
  getIdentificador,
  getConvite,
  pagarEmprestimo,
  addEmprestimoId,
  getEmprestimo,
} from "../api";
import type { ConviteResponse } from "../api";
import type { Emprestimo, Usuaria } from "../types";

interface FinancialPageProps {
  onBack: () => void;
}

const TIER_LABELS: Record<number, string> = {
  0: "Iniciante",
  1: "Aprendiz",
  2: "Artesã",
  3: "Mestra",
};

const TIER_LIMITS: Record<number, number> = {
  0: 0,
  1: 5000,
  2: 15000,
  3: 40000,
};

export default function FinancialPage({ onBack }: FinancialPageProps) {
  const [usuaria, setUsuaria] = useState<Usuaria | null>(null);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convite, setConvite] = useState<ConviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Repayment modal state
  const [repayModal, setRepayModal] = useState<{
    open: boolean;
    emprestimo: Emprestimo | null;
    valor: string;
    processing: boolean;
    result: { quitado: boolean; tier: number; saldo_devedor: number } | null;
  }>({ open: false, emprestimo: null, valor: "", processing: false, result: null });

  // Invoice display state (shown after requesting a kit)
  const [invoiceDisplay, setInvoiceDisplay] = useState<Emprestimo | null>(null);

  // Tier upgrade animation
  const [tierUpgraded, setTierUpgraded] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await ensureToken();
    if (!token) {
      setError("Não foi possível carregar seus dados. Tente novamente.");
      setLoading(false);
      return;
    }
    let me = await getMe(token);
    let activeToken = token;
    if (!me) {
      localStorage.removeItem("arakne_token");
      const retryToken = await ensureToken();
      if (!retryToken) {
        setError("Não foi possível carregar seus dados. Tente novamente.");
        setLoading(false);
        return;
      }
      me = await getMe(retryToken);
      activeToken = retryToken;
      if (!me) {
        setError("Não foi possível carregar seus dados. Tente novamente.");
        setLoading(false);
        return;
      }
    }
    setUsuaria(me);

    // Load emprestimos from stored IDs
    const ids = getEmprestimoIds();
    const results: Emprestimo[] = [];
    for (const id of ids) {
      const emp = await getEmprestimo(id);
      if (emp) results.push(emp);
    }
    results.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
    setEmprestimos(results);

    // Load convite if user is tier 3+
    if (me && me.tier >= 3) {
      const conviteData = await getConvite(activeToken);
      if (conviteData) setConvite(conviteData);
    } else {
      setConvite(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const podeEmprestar = usuaria
    ? usuaria.tier >= 1 && !usuaria.tier_congelado && usuaria.saldo_devedor === 0
    : false;

  const limite = usuaria ? TIER_LIMITS[usuaria.tier] ?? 0 : 0;

  const handleSolicitarKit = async () => {
    const ident = getIdentificador();
    if (!ident) return;
    setActionLoading(true);
    const emp = await createEmprestimo(ident);
    if (emp) {
      addEmprestimoId(emp.id);
      setEmprestimos((prev) => [emp, ...prev]);
      // Show invoice display
      setInvoiceDisplay(emp);
      await loadData();
    } else {
      setError("Não foi possível solicitar o kit no momento.");
    }
    setActionLoading(false);
  };

  // ── Repayment handlers ───────────────────────────────────────

  const openRepayModal = (emp: Emprestimo) => {
    setRepayModal({
      open: true,
      emprestimo: emp,
      valor: String(emp.valor_sats),
      processing: false,
      result: null,
    });
  };

  const closeRepayModal = () => {
    setRepayModal({ open: false, emprestimo: null, valor: "", processing: false, result: null });
  };

  const handleRepay = async () => {
    const emp = repayModal.emprestimo;
    if (!emp) return;
    const valor = parseInt(repayModal.valor, 10);
    if (!valor || valor <= 0) return;

    setRepayModal((prev) => ({ ...prev, processing: true }));
    const result = await pagarEmprestimo(emp.id, valor);

    if (result) {
      // Show result in modal
      setRepayModal((prev) => ({
        ...prev,
        processing: false,
        result: {
          quitado: result.quitado,
          tier: result.tier,
          saldo_devedor: result.saldo_devedor,
        },
      }));

      // If tier changed (quitado), trigger the upgrade animation
      if (result.quitado && usuaria && result.tier > usuaria.tier) {
        setTierUpgraded(result.tier);
        setTimeout(() => setTierUpgraded(null), 3000);
      }

      // Reload all data after a short delay so the user sees the result
      setTimeout(async () => {
        await loadData();
        closeRepayModal();
      }, 1800);
    } else {
      setRepayModal((prev) => ({ ...prev, processing: false }));
      setError("Não foi possível concluir o padrão. Tente novamente.");
      closeRepayModal();
    }
  };

  // ── Invoice display handlers ─────────────────────────────────

  const closeInvoiceDisplay = () => {
    setInvoiceDisplay(null);
  };

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page">
        <Header />
        <div className="loading">
          <div className="spinner" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Header />
      <main className="financial">
        <button className="financial__back" onClick={onBack} aria-label="Voltar">
          ← Voltar aos padrões
        </button>

        <h2 className="financial__title">Meus Materiais</h2>

        {error && (
          <div className="financial__error">
            <p>{error}</p>
            <button onClick={() => { setError(null); loadData(); }}>Tentar de novo</button>
          </div>
        )}

        {/* Tier upgrade banner */}
        {tierUpgraded !== null && (
          <div className="financial__tier-upgrade">
            <span className="financial__tier-upgrade-emoji">🎉</span>
            <span>Nível subiu para {TIER_LABELS[tierUpgraded] ?? tierUpgraded}!</span>
          </div>
        )}

        {/* Tier / Level card */}
        <div className={`financial__card financial__card--tier ${tierUpgraded !== null ? "financial__card--highlight" : ""}`}>
          <div className="financial__card-label">Nível Atual</div>
          <div className="financial__tier-display">
            <span className="financial__tier-number">{usuaria?.tier ?? 0}</span>
            <span className="financial__tier-name">
              {TIER_LABELS[usuaria?.tier ?? 0] ?? "—"}
            </span>
          </div>
          {podeEmprestar && (
            <div className="financial__tier-badge">Disponível</div>
          )}
          {usuaria?.tier_congelado && (
            <div className="financial__tier-badge financial__tier-badge--frozen">
              Pausado
            </div>
          )}
        </div>

        {/* Balance cards */}
        <div className="financial__row">
          <div className="financial__card">
            <div className="financial__card-label">Materiais Disponíveis</div>
            <div className="financial__card-value">{limite.toLocaleString("pt-BR")}</div>
          </div>
          <div className="financial__card">
            <div className="financial__card-label">Materiais em Uso</div>
            <div className="financial__card-value">
              {(usuaria?.saldo_devedor ?? 0).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>

        {/* Action button */}
        {podeEmprestar && (
          <button
            className="financial__btn financial__btn--primary"
            onClick={handleSolicitarKit}
            disabled={actionLoading}
          >
            {actionLoading ? "Solicitando..." : "Solicitar Kit de Material"}
          </button>
        )}

        {/* History */}
        <div className="financial__history">
          <h3 className="financial__history-title">Histórico de Kits</h3>
          {emprestimos.length === 0 ? (
            <p className="financial__empty">Nenhum kit solicitado ainda.</p>
          ) : (
            <ul className="financial__list">
              {emprestimos.map((emp) => (
                <li key={emp.id} className="financial__list-item">
                  <div className="financial__list-info">
                    <span className="financial__list-name">Kit #{emp.id}</span>
                    <span className="financial__list-date">
                      {new Date(emp.criado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="financial__list-right">
                    <span className="financial__list-amount">
                      {emp.valor_sats.toLocaleString("pt-BR")}
                    </span>
                    {emp.status === "ativo" ? (
                      <button
                        className="financial__btn financial__btn--small"
                        onClick={() => openRepayModal(emp)}
                        disabled={actionLoading}
                      >
                        Concluir Padrão
                      </button>
                    ) : (
                      <span className="financial__list-badge">Concluído</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Invite link — only for tier 3+ */}
        {convite && (
          <div className="financial__invite">
            <h3 className="financial__history-title">Convidar Aprendiz</h3>
            <p className="financial__invite-text">
              Compartilhe este link para convidar uma nova aprendiz:
            </p>
            <div className="financial__invite-link">
              <input
                type="text"
                readOnly
                value={window.location.origin + convite.link}
                className="financial__invite-input"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                className="financial__btn financial__btn--small"
                onClick={() => {
                  const fullLink = window.location.origin + convite.link;
                  navigator.clipboard.writeText(fullLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        {/* Pattern progress */}
        <div className="financial__progress">
          <div className="financial__progress-row">
            <span>Padrões concluídos</span>
            <span className="financial__progress-value">{usuaria?.padroes_completos ?? 0}</span>
          </div>
        </div>
      </main>

      {/* ── Repayment modal ─────────────────────────────────── */}
      {repayModal.open && repayModal.emprestimo && (
        <div className="modal-overlay" onClick={closeRepayModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {repayModal.result ? (
              // ── Result view ──
              <div className="repay-result">
                <div className="repay-result__icon">
                  {repayModal.result.quitado ? "🎉" : "✅"}
                </div>
                <h3 className="repay-result__title">
                  {repayModal.result.quitado ? "Padrão Concluído!" : "Pagamento registrado!"}
                </h3>
                <p className="repay-result__text">
                  {repayModal.result.quitado
                    ? `Seu nível subiu para ${TIER_LABELS[repayModal.result.tier] ?? repayModal.result.tier}!`
                    : `Materiais em uso: ${repayModal.result.saldo_devedor.toLocaleString("pt-BR")}`}
                </p>
              </div>
            ) : (
              // ── Input view ──
              <>
                <h3 className="modal__title">Concluir Padrão</h3>
                <p className="modal__text">
                  Kit #{repayModal.emprestimo.id} — Valor total:{" "}
                  {repayModal.emprestimo.valor_sats.toLocaleString("pt-BR")}
                </p>

                {usuaria && usuaria.saldo_devedor > 0 && (
                  <p className="modal__hint">
                    Materiais em uso: {usuaria.saldo_devedor.toLocaleString("pt-BR")}
                  </p>
                )}

                <label className="modal__label" htmlFor="repay-valor">
                  Quanto você quer pagar?
                </label>
                <input
                  id="repay-valor"
                  type="number"
                  className="modal__input"
                  value={repayModal.valor}
                  onChange={(e) => setRepayModal((prev) => ({ ...prev, valor: e.target.value }))}
                  min={1}
                  max={repayModal.emprestimo.valor_sats}
                  placeholder="Valor"
                  autoFocus
                />

                <div className="modal__quick-buttons">
                  <button
                    className="financial__btn financial__btn--small"
                    onClick={() => {
                      const half = Math.floor(repayModal.emprestimo!.valor_sats / 2);
                      setRepayModal((prev) => ({ ...prev, valor: String(half) }));
                    }}
                  >
                    Metade
                  </button>
                  <button
                    className="financial__btn financial__btn--small"
                    onClick={() => setRepayModal((prev) => ({
                      ...prev,
                      valor: String(prev.emprestimo!.valor_sats),
                    }))}
                  >
                    Tudo
                  </button>
                </div>

                <div className="modal__actions">
                  <button
                    className="financial__btn financial__btn--secondary"
                    onClick={closeRepayModal}
                    disabled={repayModal.processing}
                  >
                    Cancelar
                  </button>
                  <button
                    className="financial__btn financial__btn--primary financial__btn--small"
                    onClick={handleRepay}
                    disabled={repayModal.processing || !repayModal.valor || parseInt(repayModal.valor, 10) <= 0}
                  >
                    {repayModal.processing ? "Processando..." : "Pagar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Invoice display modal ───────────────────────────── */}
      {invoiceDisplay && invoiceDisplay.invoice_bolt11 && (
        <div className="modal-overlay" onClick={closeInvoiceDisplay}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Kit Solicitado! 🧶</h3>
            <p className="modal__text">
              Seu kit de material foi solicitado com sucesso.
              Valor: {invoiceDisplay.valor_sats.toLocaleString("pt-BR")}
            </p>
            <div className="invoice-box">
              <p className="invoice-box__label">Invoice Lightning:</p>
              <code className="invoice-box__code">{invoiceDisplay.invoice_bolt11}</code>
            </div>
            <p className="modal__hint">
              Para concluir o padrão, use o botão "Concluir Padrão" no histórico.
            </p>
            <div className="modal__actions">
              <button
                className="financial__btn financial__btn--primary financial__btn--small"
                onClick={closeInvoiceDisplay}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
