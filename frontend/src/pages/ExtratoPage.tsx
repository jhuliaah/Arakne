import { useEffect, useState } from "react";
import Header from "../components/Header";
import RecoveryBellHost from "../components/RecoveryBellHost";
import { ensureToken, getEmprestimoIds, getEmprestimo, getMinhasTrocas } from "../api";
import type { Emprestimo, Troca } from "../types";
import { useDelayedFlag } from "../lib/useDelayedFlag";

interface ExtratoPageProps {
  onBack: () => void;
}

type ItemExtrato =
  | { tipo: "fio"; data: string; emp: Emprestimo }
  | { tipo: "troca"; data: string; troca: Troca };

export default function ExtratoPage({ onBack }: ExtratoPageProps) {
  const [itens, setItens] = useState<ItemExtrato[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await ensureToken();
      if (!token) {
        setError("Não foi possível carregar o registro agora.");
        setLoading(false);
        return;
      }

      const ids = getEmprestimoIds();
      const emprestimos: Emprestimo[] = [];
      for (const id of ids) {
        const emp = await getEmprestimo(id);
        if (emp) emprestimos.push(emp);
      }

      const trocas = (await getMinhasTrocas(token)) ?? [];

      const combinados: ItemExtrato[] = [
        ...emprestimos.map((emp): ItemExtrato => ({ tipo: "fio", data: emp.criado_em, emp })),
        ...trocas.map((t): ItemExtrato => ({ tipo: "troca", data: t.criado_em, troca: t })),
      ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      setItens(combinados);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page theme-financial">
      <Header>
        <RecoveryBellHost />
      </Header>
      <main className="financial">
        <button className="financial__back" onClick={onBack} aria-label="Voltar">
          ← Voltar
        </button>

        <h2 className="financial__title">Registro de padrões</h2>

        {loading && showSkeleton && (
          <div className="trilhas__grid" aria-hidden="true" style={{ margin: "0 20px" }}>
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
        {error && <p className="field__error" style={{ margin: "0 20px" }}>{error}</p>}

        {!loading && itens.length === 0 && (
          <p className="financial__empty">Nenhum padrão registrado ainda.</p>
        )}

        {itens.length > 0 && (
          <ul className="financial__list">
            {itens.map((item, i) => {
              if (item.tipo === "fio") {
                const emp = item.emp;
                return (
                  <li key={`fio-${emp.id}`} className="financial__list-item">
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
                      <span className="financial__list-badge">
                        {emp.status === "ativo" ? "Padrão em andamento" : "Concluído"}
                      </span>
                    </div>
                  </li>
                );
              }
              const t = item.troca;
              return (
                <li key={`troca-${t.id}-${i}`} className="financial__list-item">
                  <div className="financial__list-info">
                    <span className="financial__list-name">
                      Troca {t.papel === "solicitante" ? "enviada" : "recebida"}
                    </span>
                    <span className="financial__list-date">
                      {new Date(t.criado_em).toLocaleDateString("pt-BR")} · com{" "}
                      {t.contraparte_identificador.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="financial__list-right">
                    <span
                      className={`financial__list-amount ${t.papel === "solicitante" ? "financial__list-amount--neg" : ""}`}
                    >
                      {t.papel === "solicitante" ? "-" : "+"}
                      {t.valor_sats.toLocaleString("pt-BR")} novelo(s)
                    </span>
                    <span className="financial__list-badge">
                      {t.status === "confirmada" ? "Confirmada" : t.status === "falhou" ? "Falhou" : "Pendente"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
