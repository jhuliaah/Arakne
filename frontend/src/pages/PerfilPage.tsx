import { useEffect, useState } from "react";
import Header from "../components/Header";
import BottomNav, { type NavTarget } from "../components/BottomNav";
import {
  ensureToken,
  getMe,
  getNickname,
  setDisponibilidadePonto,
  logout,
} from "../api";
import { clearStoredIdentity } from "../lib/pattern-storage";
import { clearSharesCache } from "../lib/recovery-respond";
import { useDelayedFlag } from "../lib/useDelayedFlag";
import type { Usuaria } from "../types";

interface PerfilPageProps {
  onNavigate: (target: NavTarget) => void;
  onLoggedOut: () => void;
  onVerMeuCodigo: () => void;
}

const NIVEL_LABELS: Record<number, string> = {
  0: "Iniciante",
  1: "Aprendiz",
  2: "Artesã",
  3: "Mestra",
};

export default function PerfilPage({ onNavigate, onLoggedOut, onVerMeuCodigo }: PerfilPageProps) {
  const [usuaria, setUsuaria] = useState<Usuaria | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedFlag(loading);
  const [error, setError] = useState<string | null>(null);
  const [togglingPonto, setTogglingPonto] = useState(false);
  const [pontoError, setPontoError] = useState<string | null>(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  const nickname = getNickname();

  useEffect(() => {
    (async () => {
      const token = await ensureToken();
      if (!token) {
        setError("Não foi possível carregar sua bancada agora.");
        setLoading(false);
        return;
      }
      const me = await getMe(token);
      if (!me) {
        setError("Não foi possível carregar sua bancada agora.");
        setLoading(false);
        return;
      }
      setUsuaria(me);
      setLoading(false);
    })();
  }, []);

  const handleToggleSouPonto = async () => {
    if (!usuaria) return;
    setTogglingPonto(true);
    setPontoError(null);
    const token = await ensureToken();
    if (!token) {
      setTogglingPonto(false);
      return;
    }
    const novoValor = !usuaria.disponivel_como_ponto;
    const resp = await setDisponibilidadePonto(token, novoValor);
    setTogglingPonto(false);
    if (!resp.ok) {
      setPontoError(
        "Ainda não dá pra se tornar uma Fornecedora de Linha — isso libera a partir do nível 1."
      );
      return;
    }
    setUsuaria({ ...usuaria, disponivel_como_ponto: resp.disponivel ?? novoValor });
  };

  const handleSair = () => {
    // Limpa identidade Nostr (nsec criptografado, hash do padrão, npub) E
    // os dados de sessão do backend (token, identificador, etc.). Também
    // limpa o cache em memória das shares recebidas como avalista (evita
    // que um próximo login na mesma aba responda pedidos com shares velhas).
    clearStoredIdentity();
    clearSharesCache();
    logout();
    onLoggedOut();
  };

  return (
    <div className="page">
      <Header />
      <main className="catalog">
        <h2 className="catalog__title">Bancada de Trabalho</h2>
        <p className="catalog__subtitle">{nickname ? `Olá, ${nickname}` : "Sua bancada"}</p>

        {/* Sair da conta — sempre visível no topo, independente do backend */}
        {!confirmandoSaida ? (
          <button
            className="btn btn--secondary"
            onClick={() => setConfirmandoSaida(true)}
            style={{ marginBottom: "1.5rem" }}
          >
            Sair da conta
          </button>
        ) : (
          <div className="consent-note" style={{ marginBottom: "1.5rem" }}>
            <p style={{ marginBottom: "0.75rem" }}>
              Isso limpa este aparelho. Você só volta a entrar desenhando
              seu Ponto Arakne (ou usando suas palavras do ateliê num
              aparelho novo). Tem certeza?
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn--secondary" onClick={() => setConfirmandoSaida(false)}>
                Cancelar
              </button>
              <button className="btn btn--primary" onClick={handleSair}>
                Sair mesmo assim
              </button>
            </div>
          </div>
        )}

        {loading && showSkeleton && (
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
        {error && <p className="field__error">{error}</p>}

        {usuaria && (
          <>
            <div className="community__group-card" style={{ marginBottom: "0.875rem" }}>
              <div className="community__group-emoji">🧵</div>
              <div>
                <div className="community__group-name">
                  Nível {NIVEL_LABELS[usuaria.tier] ?? usuaria.tier}
                </div>
                <div className="community__group-meta">
                  {usuaria.padroes_completos} padrões concluídos
                </div>
              </div>
            </div>

            {usuaria.tier_congelado && (
              <div className="consent-note" style={{ marginBottom: "0.875rem" }}>
                Padrão esperando você voltar — uma parceira de fio sua ainda
                não terminou o padrão dela.
              </div>
            )}

            <div className="community__group-card" style={{ marginBottom: "1.5rem" }}>
              <div className="community__group-emoji">🪢</div>
              <div style={{ flex: 1 }}>
                <div className="community__group-name">Fornecedora de Linha</div>
                <div className="community__group-meta">
                  {usuaria.trocas_como_ponto_concluidas} trocas concluídas
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={usuaria.disponivel_como_ponto}
                  disabled={togglingPonto}
                  onChange={handleToggleSouPonto}
                />
              </label>
            </div>
            {pontoError && <p className="field__error">{pontoError}</p>}

            <button className="btn btn--secondary" onClick={onVerMeuCodigo} style={{ marginBottom: "1.5rem" }}>
              Mostrar meu código
            </button>
          </>
        )}
      </main>
      <BottomNav active="perfil" onNavigate={onNavigate} />
    </div>
  );
}
