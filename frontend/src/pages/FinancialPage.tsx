 /** Tela do ateliê — painel da artesã depois de entrar com o código. */


import { useEffect, useState, useCallback } from "react";
import Header from "../components/Header";
import RecoveryBellHost from "../components/RecoveryBellHost";
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
  listarPontosDeTroca,
  setDisponibilidadePonto,
  criarTroca,
} from "../api";
import type { ConviteResponse } from "../api";
import type { Emprestimo, PontoDeTroca, Usuaria } from "../types";
import { useDelayedFlag } from "../lib/useDelayedFlag";
import MeuCodigoQR from "../components/MeuCodigoQR";

interface FinancialPageProps {
  onBack: () => void;
  onVerExtrato: () => void;
  onAbrirScanner: () => void;
  prefilledPontoIdentificador?: string | null;
  onPrefillConsumed?: () => void;
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

export default function FinancialPage({
  onBack,
  onVerExtrato,
  onAbrirScanner,
  prefilledPontoIdentificador,
  onPrefillConsumed,
}: FinancialPageProps) {
  const [usuaria, setUsuaria] = useState<Usuaria | null>(null);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convite, setConvite] = useState<ConviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Fornecedoras de Linha (Ponto de Troca)
  const [pontos, setPontos] = useState<PontoDeTroca[]>([]);
  const [togglingPonto, setTogglingPonto] = useState(false);
  const [pontosError, setPontosError] = useState<string | null>(null);
  const [trocaAlvo, setTrocaAlvo] = useState<string | null>(null);
  const [valorTroca, setValorTroca] = useState("");
  const [trocaLoading, setTrocaLoading] = useState(false);
  const [trocaMsg, setTrocaMsg] = useState<string | null>(null);

  // Repayment modal state
  const [repayModal, setRepayModal] = useState<{
    open: boolean;
    emprestimo: Emprestimo | null;
    valor: string;
    processing: boolean;
    result: { quitado: boolean; tier: number; saldo_devedor: number } | null;
  }>({ open: false, emprestimo: null, valor: "", processing: false, result: null });

  // Confirmação de "Puxar novelos" (substitui a exibição da invoice)
  const [liberadoDisplay, setLiberadoDisplay] = useState<Emprestimo | null>(null);

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

    // Load available Pontos de Troca (Fornecedoras de Linha)
    const pontosData = await listarPontosDeTroca(activeToken);
    if (pontosData) setPontos(pontosData);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (prefilledPontoIdentificador) {
      setTrocaAlvo(prefilledPontoIdentificador);
      setTrocaMsg(null);
      onPrefillConsumed?.();
    }
  }, [prefilledPontoIdentificador, onPrefillConsumed]);

  const podeEmprestar = usuaria
    ? usuaria.tier >= 1 && !usuaria.tier_congelado && usuaria.saldo_devedor === 0
    : false;

  const limite = usuaria ? TIER_LIMITS[usuaria.tier] ?? 0 : 0;

  // ── Fornecedoras de Linha (Ponto de Troca) ───────────────────

  const handleToggleSouPonto = async () => {
    if (!usuaria) return;
    setTogglingPonto(true);
    setPontosError(null);
    const token = await ensureToken();
    if (!token) {
      setTogglingPonto(false);
      return;
    }
    const novoValor = !usuaria.disponivel_como_ponto;
    const resp = await setDisponibilidadePonto(token, novoValor);
    setTogglingPonto(false);
    if (!resp.ok) {
      setPontosError(
        "Ainda não dá pra se tornar uma Fornecedora de Linha — isso libera a partir do nível 1."
      );
      return;
    }
    setUsuaria({ ...usuaria, disponivel_como_ponto: resp.disponivel ?? novoValor });
  };

  const handlePedirTroca = async (pontoIdentificador: string) => {
    const valor = Number(valorTroca);
    if (!valor || valor <= 0) {
      setTrocaMsg("Digite um valor válido.");
      return;
    }
    setTrocaLoading(true);
    setTrocaMsg(null);
    const token = await ensureToken();
    if (!token) {
      setTrocaLoading(false);
      setTrocaMsg("Não foi possível confirmar agora. Tente de novo.");
      return;
    }
    const troca = await criarTroca(token, pontoIdentificador, valor);
    setTrocaLoading(false);
    if (!troca || troca.status !== "confirmada") {
      setTrocaMsg("Não conseguimos confirmar essa troca. Verifique antes de tentar de novo.");
      return;
    }
    setTrocaMsg(`Troca confirmada! ${valor.toLocaleString("pt-BR")} combinados.`);
    setValorTroca("");
    setTrocaAlvo(null);
    const token2 = await ensureToken();
    if (token2) {
      const pontosData = await listarPontosDeTroca(token2);
      if (pontosData) setPontos(pontosData);
    }
  };

  const handleSolicitarKit = async () => {
    const ident = getIdentificador();
    if (!ident) return;
    setActionLoading(true);
    const emp = await createEmprestimo(ident);
    if (emp) {
      addEmprestimoId(emp.id);
      setEmprestimos((prev) => [emp, ...prev]);
      // Mostra só a confirmação amigável (sem exibir invoice/bolt11)
      setLiberadoDisplay(emp);
      await loadData();
    } else {
      setError("Não foi possível puxar novelos agora.");
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
      setError(
        "Não conseguimos confirmar a devolução agora. Pode ser que tenha falhado, ou que ainda esteja em confirmação — confira o registro de padrões antes de tentar de novo, pra evitar duplicar a devolução."
      );
      closeRepayModal();
    }
  };

  // ── Confirmação "Puxar novelos" ─────────────────────────────

  const closeLiberadoDisplay = () => {
    setLiberadoDisplay(null);
  };

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page theme-financial">
        <Header>
          <RecoveryBellHost />
        </Header>
        <main className="financial">
          <button className="financial__back" onClick={onBack} aria-label="Voltar">
            ← Voltar aos padrões
          </button>
          <h2 className="financial__title">Seu ateliê</h2>
          {showSkeleton && (
            <div className="trilhas__grid" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <div className="skeleton-card" key={i}>
                  <div className="skeleton skeleton-card__visual" />
                  <div className="skeleton-card__body">
                    <div className="skeleton skeleton--text" />
                    <div className="skeleton skeleton--text skeleton--short" />
                    <div className="skeleton skeleton--bar" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="page theme-financial">
      <Header>
        <RecoveryBellHost />
      </Header>
      <main className="financial">
        <button className="financial__back" onClick={onBack} aria-label="Voltar">
          ← Voltar aos padrões
        </button>

        <div className="financial__brand">
          <img src="/logo-arakne-crest.png" alt="" className="financial__brand-mark" />
          <span className="financial__brand-name">ARAKNE</span>
          <span className="financial__brand-tagline">Tecemos possibilidades. Você cria sua história.</span>
        </div>

        <h2 className="financial__title">Seu ateliê</h2>

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
            <span>Nova técnica disponível: {TIER_LABELS[tierUpgraded] ?? tierUpgraded}. Você desbloqueou uma capacidade nova no seu ateliê.</span>
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

        {usuaria?.tier_congelado && (
          <div className="financial__error" style={{ margin: "0 20px 1rem" }}>
            <strong>Padrão esperando você voltar.</strong> Uma parceira de fio
            sua ainda não terminou o padrão dela, e isso pausa o seu ateliê
            também — é assim que o sistema protege o grupo. Assim que o padrão
            dela voltar a andar, seu ateliê volta ao normal automaticamente.
            Você ainda pode usar tudo o que já tem disponível enquanto isso.
          </div>
        )}

        {/* Balance cards */}
        <div className="financial__row">
          <div className="financial__card">
            <div className="financial__card-label">Material disponível</div>
            <div className="financial__card-value">
              {limite.toLocaleString("pt-BR")} <span className="financial__card-unit">novelo(s)</span>
            </div>
          </div>
          <div className="financial__card">
            <div className="financial__card-label">Padrão em andamento</div>
            <div className="financial__card-value">
              {(usuaria?.saldo_devedor ?? 0).toLocaleString("pt-BR")} <span className="financial__card-unit">novelo(s)</span>
            </div>
          </div>
        </div>

        {/* Estoque capacity hint */}
        <p className="field__hint" style={{ margin: "0 20px 0.75rem" }}>
          Capacidade do seu estoque: até {limite.toLocaleString("pt-BR")} novelos.
        </p>

        {/* Action button */}
        {podeEmprestar && (
          <button
            className="financial__btn financial__btn--primary"
            onClick={handleSolicitarKit}
            disabled={actionLoading}
          >
            {actionLoading ? "Puxando..." : "Puxar novelos"}
          </button>
        )}

        {/* History */}
        <div className="financial__history">
          <h3 className="financial__history-title">Padrões recentes</h3>
          <button
            className="financial__btn financial__btn--small"
            style={{ marginBottom: "0.75rem" }}
            onClick={onVerExtrato}
          >
            Ver registro de padrões
          </button>
          {emprestimos.length === 0 ? (
            <p className="financial__empty">Nenhum padrão puxado ainda.</p>
          ) : (
            <ul className="financial__list">
              {emprestimos.map((emp) => (
                <li key={emp.id} className="financial__list-item">
                  <div className="financial__list-info">
                    <span className="financial__list-name">Padrão #{emp.id}</span>
                    <span className="financial__list-date">
                      {new Date(emp.criado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div className="financial__list-right">
                    <span className="financial__list-amount">
                      {emp.valor_sats.toLocaleString("pt-BR")} novelo(s)
                    </span>
                    {emp.status === "ativo" ? (
                      <button
                        className="financial__btn financial__btn--small"
                        onClick={() => openRepayModal(emp)}
                        disabled={actionLoading}
                      >
                        Devolver novelos
                      </button>
                    ) : (
                      <span className="financial__list-badge">Padrão concluído! 🧵</span>
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

        {/* Fornecedoras de Linha (Ponto de Troca) — nível 1+ */}
        <div className="financial__invite">
          <h3 className="financial__history-title">Fornecedoras de Linha</h3>
          <p className="financial__invite-text">
            Tecedoras de confiança que trocam fio por material direto com você.
          </p>

          <button
            className="financial__btn financial__btn--small"
            style={{ marginBottom: "0.75rem" }}
            onClick={onAbrirScanner}
          >
            📷 Escanear código de uma tecedora
          </button>

          {pontosError && <p className="field__error">{pontosError}</p>}

          {usuaria && (
            <label className="checkbox-row" style={{ margin: "0.75rem 0" }}>
              <input
                type="checkbox"
                checked={usuaria.disponivel_como_ponto}
                disabled={togglingPonto}
                onChange={handleToggleSouPonto}
              />
              <span>
                Quero me tornar uma Fornecedora de Linha (aparecer para outras
                tecedoras trocarem fio com você).
              </span>
            </label>
          )}

          {pontos.length === 0 ? (
            <p className="field__hint">Nenhuma Fornecedora de Linha por perto ainda.</p>
          ) : (
            <ul className="financial__list">
              {pontos.map((p) => (
                <li key={p.identificador} className="financial__list-item">
                  <div className="financial__list-info">
                    <span className="financial__list-name">{p.identificador.slice(0, 8)}…</span>
                    <span className="financial__list-date">
                      {p.trocas_como_ponto_concluidas} trocas concluídas
                    </span>
                  </div>
                  <button
                    className="financial__btn financial__btn--small"
                    onClick={() => {
                      setTrocaAlvo(trocaAlvo === p.identificador ? null : p.identificador);
                      setTrocaMsg(null);
                    }}
                  >
                    {trocaAlvo === p.identificador ? "Fechar" : "Pedir troca"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {trocaAlvo && (
            <div className="consent-note" style={{ marginTop: "0.75rem" }}>
              <div className="field" style={{ marginBottom: "0.5rem" }}>
                <label className="field__label" htmlFor="valorTroca">Quanto quer trocar?</label>
                <input
                  id="valorTroca"
                  className="field__input"
                  inputMode="numeric"
                  placeholder="Ex.: 2000"
                  value={valorTroca}
                  onChange={(e) => setValorTroca(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              {trocaMsg && <p className="field__hint">{trocaMsg}</p>}
              <button
                className="btn btn--primary"
                onClick={() => handlePedirTroca(trocaAlvo)}
                disabled={trocaLoading}
              >
                {trocaLoading ? "Combinando..." : "Confirmar troca"}
              </button>
            </div>
          )}
        </div>

        {/* Meu código de Ponto de Troca (Mudança #6) — QR do
            identificador da usuária, para outra tecedora escanear em
            vez de digitar à mão. Saiu do PerfilPage (camada crochê) e
            passou a viver aqui, na camada financeira — o QR de
            Fornecedora de Linha não pertence à bancada crochê. */}
        <div className="financial__invite">
          <h3 className="financial__history-title">Meu código de Ponto de Troca</h3>
          <p className="financial__invite-text">
            Mostre este código para outra tecedora escanear, em vez de
            digitar seu identificador na mão.
          </p>
          <MeuCodigoQR compact />
        </div>

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
                  {repayModal.result.quitado ? "Padrão concluído! 🧵" : "Devolução registrada!"}
                </h3>
                <p className="repay-result__text">
                  {repayModal.result.quitado
                    ? "Você terminou essa peça. Um novo nível de técnica foi desbloqueado."
                    : `Faltam ${repayModal.result.saldo_devedor.toLocaleString("pt-BR")} novelo(s) pra terminar esse padrão.`}
                </p>
              </div>
            ) : (
              // ── Input view ──
              <>
                <h3 className="modal__title">Devolver novelos</h3>
                <p className="modal__text">
                  Quanto você quer devolver hoje?
                </p>

                {usuaria && usuaria.saldo_devedor > 0 && (
                  <p className="modal__hint">
                    Padrão em andamento: {usuaria.saldo_devedor.toLocaleString("pt-BR")} novelo(s)
                  </p>
                )}

                <label className="modal__label" htmlFor="repay-valor">
                  Quanto você quer devolver?
                </label>
                <input
                  id="repay-valor"
                  type="number"
                  className="modal__input"
                  value={repayModal.valor}
                  onChange={(e) => setRepayModal((prev) => ({ ...prev, valor: e.target.value }))}
                  min={1}
                  max={repayModal.emprestimo.valor_sats}
                  placeholder="Quantos novelos"
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
                    {repayModal.processing ? "Processando..." : "Confirmar devolução"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Confirmação "Puxar novelos" ────────────────────── */}
      {liberadoDisplay && (
        <div className="modal-overlay" onClick={closeLiberadoDisplay}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal__title">Padrão liberado!</h3>
            <p className="modal__text">
              Seus novelos já estão no seu estoque. Boa costura.
            </p>
            <div className="modal__actions">
              <button
                className="financial__btn financial__btn--primary financial__btn--small"
                onClick={closeLiberadoDisplay}
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
