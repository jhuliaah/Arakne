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
  pagarEmprestimo,
  addEmprestimoId,
  getEmprestimo,
} from "../api";
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await ensureToken();
    if (!token) {
      setError("Não foi possível carregar seus dados. Tente novamente.");
      setLoading(false);
      return;
    }
    const me = await getMe(token);
    if (!me) {
      setError("Não foi possível carregar seus dados. Tente novamente.");
      setLoading(false);
      return;
    }
    setUsuaria(me);

    // Load emprestimos from stored IDs
    const ids = getEmprestimoIds();
    const results: Emprestimo[] = [];
    for (const id of ids) {
      const emp = await getEmprestimo(id);
      if (emp) results.push(emp);
    }
    // Sort by most recent first
    results.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());
    setEmprestimos(results);
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
      await loadData();
    } else {
      setError("Não foi possível solicitar o kit no momento.");
    }
    setActionLoading(false);
  };

  const handleConcluirPadrao = async (emprestimoId: number, valor: number) => {
    setActionLoading(true);
    const result = await pagarEmprestimo(emprestimoId, valor);
    if (result) {
      await loadData();
    } else {
      setError("Não foi possível concluir o padrão.");
    }
    setActionLoading(false);
  };

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
            <button onClick={() => setError(null)}>Ok</button>
          </div>
        )}

        {/* Tier / Level card */}
        <div className="financial__card financial__card--tier">
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
                        onClick={() => handleConcluirPadrao(emp.id, emp.valor_sats)}
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

        {/* Pattern progress (disguised tier info) */}
        <div className="financial__progress">
          <div className="financial__progress-row">
            <span>Padrões concluídos</span>
            <span className="financial__progress-value">{usuaria?.padroes_completos ?? 0}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
