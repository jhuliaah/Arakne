/** RecoverySetupPage — onboarding: distribuir os fios de sustentação.
 *
 *  Substitui a BackupPage no fluxo de onboarding (Track 3C, Fase 3 do
 *  plano de recuperação Nostr). Aparece DEPOIS de criar a conta e
 *  desenhar o Ponto Arakne, e ANTES de ir para o catálogo.
 *
 *  Disfarce: a tela inteira usa vocabulário de crochê/tecelagem.
 *  "Tecelãs de confiança" = avalistas de recuperação. "Fios de
 *  sustentação" = shares SSSS do nsec. Nenhuma palavra-chave de
 *  segurança ou criptografia aparece no copy.
 *
 *  Fluxo:
 *  1. Busca os 3 avalistas do backend (GET /usuarias/me/avalistas-recuperacao).
 *     Slot 1 = convidadora (pré-preenchida se veio de convite), slots
 *     2 e 3 = sombras automáticas geradas pelo backend quando a dona
 *     não indicou ninguém.
 *  2. Mostra a lista com npub truncado, label e badge "sombra".
 *  3. Botão "Distribuir fios de sustentação" → distributeShares(nsec,
 *     npub, avalistasNpubs) — envelopa NIP-59 e publica nos relays.
 *  4. Sucesso: "Sustentação configurada!" → botão "Continuar" → onDone().
 *
 *  O nsec da dona é passado como prop (em memória, vindo do
 *  CreateAccountPage via App.tsx). Ele NUNCA é persistido em plaintext
 *  e NUNCA vai ao backend — só é usado aqui para assinar o seal NIP-59
 *  das shares endereçadas a cada avalista.
 */

import { useEffect, useState } from "react";
import Header from "../../components/Header";
import { ensureToken, getAvalistasRecuperacao, markUnlockedThisSession, type AvalistaRecuperacao } from "../../api";
import { distributeShares, isDistributed, type DistributeResult } from "../../lib/recovery-distribute";

interface RecoverySetupPageProps {
  /** npub da dona (bech32 npub1...). */
  npub: string;
  /** nsec da dona (bech32 nsec1...) — passado a distributeShares.
   *  Existe só em memória entre CreateAccountPage e esta tela. */
  nsec: string;
  /** Vai para o catálogo (fim do onboarding). */
  onDone: () => void;
  /** Volta para o passo anterior do onboarding. */
  onBack: () => void;
}

type Phase = "loading" | "ready" | "distributing" | "success" | "error";

/** Trunca um npub bech32 no formato `npub1...abc` (primeiros 8 + últimos 3). */
function truncarNpub(npub: string): string {
  if (npub.length <= 14) return npub;
  return `${npub.slice(0, 8)}...${npub.slice(-3)}`;
}

export default function RecoverySetupPage({ npub, nsec, onDone, onBack }: RecoverySetupPageProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [avalistas, setAvalistas] = useState<AvalistaRecuperacao[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [result, setResult] = useState<DistributeResult | null>(null);
  const [alreadyDistributed, setAlreadyDistributed] = useState(false);

  // ── Busca os 3 avalistas do backend ao montar ───────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await ensureToken();
      if (!token) {
        if (!cancelled) {
          setFetchError(true);
          setPhase("ready");
        }
        return;
      }
      const lista = await getAvalistasRecuperacao(token);
      if (cancelled) return;
      if (!lista || lista.length === 0) {
        // Backend ainda não tem o endpoint (Track 3B) ou retornou vazio.
        // Mostramos a tela em modo degradado: o botão continua disponível
        // mas avisa que não há tecelãs configuradas.
        setFetchError(true);
        setAvalistas([]);
        setPhase("ready");
        return;
      }
      // Ordena por `ordem` para garantir slot 1 = convidadora.
      const ordenadas = [...lista].sort((a, b) => a.ordem - b.ordem);
      setAvalistas(ordenadas);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Se já distribuímos antes (re-entrada), pula direto ao sucesso ─
  useEffect(() => {
    if (isDistributed()) {
      setAlreadyDistributed(true);
    }
  }, []);

  async function handleDistribute() {
    setPhase("distributing");
    try {
      const npubs = avalistas.map((a) => a.npub_avaliadora);
      if (npubs.length !== 3) {
        // Sem 3 avalistas não dá para distribuir — Track 3B garante 3,
        // mas defendemos caso o backend ainda não tenha preenchido.
        setPhase("error");
        return;
      }
      const res = await distributeShares(nsec, npub, npubs);
      setResult(res);
      // Considera sucesso se ao menos o threshold (2) foi publicado.
      if (res.published >= 2) {
        setPhase("success");
      } else {
        setPhase("error");
      }
    } catch (err) {
      console.error("[RecoverySetupPage] distributeShares falhou:", err);
      setPhase("error");
    }
  }

  function handleContinue() {
    markUnlockedThisSession();
    onDone();
  }

  const podeDistribuir = avalistas.length === 3 && !alreadyDistributed;

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <button className="onboarding__back" onClick={onBack}>← Voltar</button>
        <h1 className="onboarding__title">Suas tecelãs de confiança</h1>
        <p className="onboarding__tagline">
          Escolha quem sustenta seus fios quando precisar de ajuda.
        </p>

        {/* Lista de avalistas */}
        <ul className="tecelas-list">
          {phase === "loading" && (
            <li className="tecelas-list__item tecelas-list__item--skeleton">
              <span className="skeleton skeleton--text" />
              <span className="skeleton skeleton--text skeleton--short" />
            </li>
          )}
          {phase !== "loading" && avalistas.length === 0 && (
            <li className="tecelas-list__empty">
              {fetchError
                ? "Não foi possível carregar suas tecelãs agora. Você pode tentar de novo em instantes."
                : "Suas tecelãs ainda não foram configuradas."}
            </li>
          )}
          {avalistas.map((a, i) => (
            <li
              key={a.id}
              className={`tecelas-list__item${a.is_shadow ? " tecelas-list__item--shadow" : ""}`}
            >
              <div className="tecelas-list__slot">#{i + 1}</div>
              <div className="tecelas-list__info">
                <span className="tecelas-list__npub">{truncarNpub(a.npub_avaliadora)}</span>
                <span className="tecelas-list__meta">
                  {a.is_shadow ? "Tecelã-sombra" : "Tecelã indicada por você"}
                </span>
              </div>
              {a.is_shadow && <span className="tecelas-list__badge">sombra</span>}
            </li>
          ))}
        </ul>

        {/* Explicação curta (disfarce: nada de "criptografia") */}
        <p className="tecelas-explain">
          Suas tecelãs guardam uma parte do seu fio. Se você perder seu
          Ponto Arakne, 2 delas precisam te ajudar para reconstruir seu
          ateliê.
        </p>

        {/* Estados */}
        {alreadyDistributed && phase !== "success" && (
          <div className="tecelas-note">
            Você já distribuiu seus fios de sustentação antes. Pode continuar.
          </div>
        )}

        {phase === "error" && (
          <div className="tecelas-error">
            <p>Não conseguimos distribuir seus fios agora. Tente novamente.</p>
          </div>
        )}

        {phase === "distributing" && (
          <div className="tecelas-loading">
            <span className="spinner" />
            <p>Tecendo seus fios de sustentação...</p>
          </div>
        )}

        {phase !== "success" && (
          <button
            className="btn btn--primary"
            onClick={handleDistribute}
            disabled={phase === "distributing" || !podeDistribuir}
          >
            Distribuir fios de sustentação
          </button>
        )}

        {phase === "success" && (
          <div className="tecelas-success">
            <div className="tecelas-success__icon">🧶</div>
            <h2 className="tecelas-success__title">Sustentação configurada!</h2>
            <p className="tecelas-success__text">
              Suas tecelãs estão guardando seus fios.
            </p>
            {result && (
              <p className="tecelas-success__detail">
                {result.published} de {result.totalShares} fios entregues.
              </p>
            )}
            <button className="btn btn--primary" onClick={handleContinue}>
              Continuar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
