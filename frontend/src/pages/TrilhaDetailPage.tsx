/** Trilha detail page — shows the 3 níveis with aulas, progress, and locks.

  Level progression is gated: nível N only unlocks after all aulas of nível
  N-1 are concluded. A symbolic certificate appears when the trilha is
  complete. Purely educational — no financial coupling.
*/

import { useEffect, useState } from "react";
import Header from "../components/Header";
import RecoveryBellHost from "../components/RecoveryBellHost";
import BottomNav, { type NavTarget } from "../components/BottomNav";
import { getTrilha } from "../api";
import type { Aula, TrilhaDetail } from "../types";

interface TrilhaDetailPageProps {
  trilhaId: number;
  onBack: () => void;
  onOpenAula: (aula: Aula) => void;
  onNavigate: (target: NavTarget) => void;
}

export default function TrilhaDetailPage({
  trilhaId,
  onBack,
  onOpenAula,
  onNavigate,
}: TrilhaDetailPageProps) {
  const [trilha, setTrilha] = useState<TrilhaDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTrilha(trilhaId).then((data) => {
      setTrilha(data);
      setLoading(false);
    });
  }, [trilhaId]);

  const progressPct = trilha && trilha.total_aulas > 0
    ? Math.round((trilha.aulas_concluidas / trilha.total_aulas) * 100)
    : 0;
  const completa = trilha !== null && trilha.aulas_concluidas === trilha.total_aulas && trilha.total_aulas > 0;

  return (
    <div className="page">
      <Header>
        <RecoveryBellHost />
      </Header>
      <main className="catalog">
        <button className="financial__back" onClick={onBack} aria-label="Voltar">
          ← Voltar
        </button>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <p>Carregando trilha...</p>
          </div>
        ) : !trilha ? (
          <p className="catalog__empty">Trilha não encontrada.</p>
        ) : (
          <>
            <div className="trilha-detail__header" style={{ "--trilha-cor": trilha.cor } as React.CSSProperties}>
              <span className="trilha-detail__emoji">{trilha.emoji}</span>
              <h2 className="trilha-detail__title">{trilha.titulo}</h2>
              <div className="trilha-detail__tags">
                <span className="trilha-card__tag">{trilha.tecnica}</span>
                <span className="trilha-card__tag trilha-card__tag--estilo">{trilha.estilo}</span>
              </div>
              <p className="trilha-detail__desc">{trilha.descricao}</p>
              <div className="trilha-detail__progress">
                <div className="trilha-card__progress-bar">
                  <div
                    className="trilha-card__progress-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="trilha-card__progress-text">
                  {trilha.aulas_concluidas}/{trilha.total_aulas} aulas concluídas
                </span>
              </div>
            </div>

            {completa && (
              <div className="trilha-detail__certificate">
                <span className="trilha-detail__certificate-emoji">🏅</span>
                <div>
                  <p className="trilha-detail__certificate-title">Trilha concluída!</p>
                  <p className="trilha-detail__certificate-text">
                    Você completou todas as aulas. Parabéns pelo seu certificado simbólico.
                  </p>
                </div>
              </div>
            )}

            {trilha.niveis.map((nivel) => (
              <section
                key={nivel.nivel}
                className={`nivel ${!nivel.desbloqueado ? "nivel--locked" : ""}`}
              >
                <div className="nivel__header">
                  <h3 className="nivel__title">
                    {!nivel.desbloqueado && <span className="nivel__lock" aria-hidden="true">🔒</span>}
                    {nivel.label}
                  </h3>
                  {!nivel.desbloqueado && (
                    <span className="nivel__locked-hint">Conclua o nível anterior</span>
                  )}
                </div>

                <ol className="nivel__aulas">
                  {nivel.aulas.map((aula) => (
                    <li key={aula.id}>
                      <button
                        className={`aula-item ${aula.concluida ? "aula-item--done" : ""}`}
                        onClick={() => nivel.desbloqueado && onOpenAula(aula)}
                        disabled={!nivel.desbloqueado}
                      >
                        <span className="aula-item__check" aria-hidden="true">
                          {aula.concluida ? "✓" : nivel.desbloqueado ? "○" : "·"}
                        </span>
                        <span className="aula-item__body">
                          <span className="aula-item__title">{aula.titulo}</span>
                          <span className="aula-item__desc">{aula.descricao}</span>
                        </span>
                        {nivel.desbloqueado && (
                          <span className="aula-item__arrow" aria-hidden="true">›</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </main>
      <BottomNav active="catalog" onNavigate={onNavigate} />
    </div>
  );
}
