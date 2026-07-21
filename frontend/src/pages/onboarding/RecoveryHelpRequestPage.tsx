/** RecoveryHelpRequestPage — convidada pede ajuda disfarçada (Track 4D).
 *
 *  Tela que a convidada vê quando não tem PIN nem nsec (botão "Pedir aula
 *  de ponto" da Lane B em RecoverAccountPage leva aqui). Fluxo:
 *
 *  1. Pede `identificador` (da conta perdida).
 *  2. Mostra lista de tecelãs vinculadas (via `getAvalistasByIdentificador(id)`
 *     — sem auth, lookup público). Mostra apelido (Lane A/B) ou npub
 *     truncado.
 *  3. Convidada escolhe qual tecelã pedir ajuda (ou "todas").
 *  4. Gera nsec efêmero, faz login (reusa `recovery-request.ts`
 *     `startRecoveryRequest`), publica gift-wrap `type:"request"`
 *     endereçado à tecelã escolhida.
 *  5. Mostra mensagem disfarçada "Aula solicitada. Aguarde a tecelã
 *     preparar o padrão e escaneie quando ela compartilhar." →
 *     transiciona para a tela `RecoveryScanner` (via callback
 *     `onAwaitScanner` que a Lane D conecta).
 *  6. Disfarce total: parece "pedir aula de ponto a uma tecelã". Sem
 *     "recuperação", sem "chave", sem "criptografia".
 *
 *  Decisão de design: esta tela NÃO pede PIN (a convidada não tem).
 *  Reusa `startRecoveryRequest(identificador, pin)` passando um PIN
 *  vazio — a função ainda busca npub + avalistas no backend (endpoint
 *  público) e publica o pedido NIP-59. A share 1 do backend não virá
 *  (sem PIN), mas o pedido à tecelã é independente disso. A Lane D
 *  decide como a convidada obtém a share 1 depois (possivelmente via
 *  PIN recuperado por outro canal, ou a recuperação é só via share 0
 *  da tecelã + paper backup — fora do escopo desta tela).
 */

import { useState } from "react";
import Header from "../../components/Header";
import {
  startRecoveryRequest,
  type RecoveryRequestResult,
} from "../../lib/recovery-request";
import {
  getAvalistasByIdentificador,
  type AvalistaRecuperacao,
} from "../../api";

interface RecoveryHelpRequestPageProps {
  /** Chamado quando o pedido foi publicado e a convidada deve escanear.
   *  A Lane D conecta à tela RecoveryScanner. Recebe o nsec efêmero
   *  (para a Lane D guardar e usar no fluxo de combinação de shares). */
  onAwaitScanner: (ephemeralNsec: Uint8Array) => void;
  /** Volta para a tela anterior. */
  onBack: () => void;
}

/** Estado da tela. */
type Phase =
  | "input" // Estado 1: input do identificador
  | "buscando" // Estado 2: buscando tecelãs no backend
  | "escolhendo" // Estado 3: escolher qual tecelã pedir
  | "enviando" // Estado 4: publicando pedido NIP-59
  | "aguardando" // Estado 5: pedido publicado, aguardar scanner
  | "erro"; // Estado 6: erro

/** Trunca npub bech32 para "npub1…abcd". */
function truncarNpub(npub: string): string {
  if (!npub || npub.length < 16) return npub;
  return `${npub.slice(0, 8)}…${npub.slice(-4)}`;
}

export default function RecoveryHelpRequestPage({
  onAwaitScanner,
  onBack,
}: RecoveryHelpRequestPageProps) {
  const [phase, setPhase] = useState<Phase>("input");
  const [identificador, setIdentificador] = useState("");
  const [avalistas, setAvalistas] = useState<AvalistaRecuperacao[]>([]);
  const [escolhidaIndex, setEscolhidaIndex] = useState<number>(-1); // -1 = todas
  const [errorMsg, setErrorMsg] = useState("");
  const [ephemeralNsec, setEphemeralNsec] = useState<Uint8Array | null>(null);

  // ── Estado 2: busca tecelãs no backend ──────────────────────
  async function handleBuscar() {
    const id = identificador.trim();
    if (!id) {
      setErrorMsg("Informe o identificador do seu ateliê.");
      setPhase("erro");
      return;
    }
    setPhase("buscando");
    setErrorMsg("");
    try {
      const lista = await getAvalistasByIdentificador(id);
      if (!lista || lista.length === 0) {
        setErrorMsg(
          "Não encontramos tecelãs vinculadas a esse ateliê. Confira o identificador."
        );
        setPhase("erro");
        return;
      }
      setAvalistas(lista);
      setEscolhidaIndex(-1); // default: todas
      setPhase("escolhendo");
    } catch (err) {
      console.error("[RecoveryHelpRequestPage] busca de avalistas falhou:", err);
      setErrorMsg("Não conseguimos buscar suas tecelãs agora. Tente de novo.");
      setPhase("erro");
    }
  }

  // ── Estado 4: publica pedido NIP-59 ─────────────────────────
  async function handlePedirAjuda() {
    setPhase("enviando");
    setErrorMsg("");
    try {
      // startRecoveryRequest busca npub + avalistas, faz login (com
      // PIN vazio — falha silenciosamente no login, mas o pedido NIP-59
      // ainda é publicado para os avalistas) e publica o gift-wrap.
      const result: RecoveryRequestResult = await startRecoveryRequest(
        identificador.trim(),
        "", // sem PIN — a convidada não tem
      );

      // Se a convidada escolheu uma tecelã específica, mas o pedido
      // foi publicado para todas (startRecoveryRequest não filtra),
      // tudo bem — o QR on-demand é gerado só pela tecelã que aceitar.
      // Se published === 0, nenhuma tecelã recebeu.
      if (result.published === 0) {
        setErrorMsg(
          "Não conseguimos enviar o pedido às tecelãs agora. Tente de novo mais tarde."
        );
        setPhase("erro");
        return;
      }

      setEphemeralNsec(result.ephemeralNsec);
      setPhase("aguardando");
    } catch (err) {
      console.error("[RecoveryHelpRequestPage] startRecoveryRequest falhou:", err);
      setErrorMsg(
        "Não conseguimos enviar o pedido às tecelãs agora. Confira o identificador e tente de novo."
      );
      setPhase("erro");
    }
  }

  function handleIrParaScanner() {
    if (ephemeralNsec) {
      onAwaitScanner(ephemeralNsec);
    }
  }

  function handleTentarDeNovo() {
    setErrorMsg("");
    setPhase(identificador.trim() ? "escolhendo" : "input");
  }

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <button className="onboarding__back" onClick={onBack}>
          ← Voltar
        </button>

        {/* Estado 1 — Input do identificador */}
        {phase === "input" && (
          <>
            <h1 className="onboarding__title">Pedir aula de ponto</h1>
            <p className="onboarding__tagline">
              Sem seu Ponto Arakne? Uma tecelã de confiança pode te ajudar
              a reatar os fios do seu ateliê.
            </p>

            <div className="onboarding__form">
              <div className="field">
                <label className="field__label" htmlFor="identificador">
                  Identificador do seu ateliê
                </label>
                <input
                  id="identificador"
                  className="field__input"
                  type="text"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="abc123_XyZ"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="field__hint">
                  É o código que você anotou ao criar sua conta.
                </p>
              </div>

              <button
                className="btn btn--primary"
                onClick={handleBuscar}
                disabled={!identificador.trim()}
              >
                Procurar tecelãs
              </button>
            </div>
          </>
        )}

        {/* Estado 2 — Buscando tecelãs (loading) */}
        {phase === "buscando" && (
          <div className="recover__status">
            <span className="spinner" />
            <p className="recover__status-text">Procurando suas tecelãs...</p>
          </div>
        )}

        {/* Estado 3 — Escolher qual tecelã pedir */}
        {phase === "escolhendo" && (
          <>
            <h1 className="onboarding__title">Escolha a tecelã</h1>
            <p className="onboarding__tagline">
              Para qual tecelã você quer pedir a aula de ponto?
            </p>

            <div className="onboarding__form">
              <div className="field">
                <label className="field__label">Tecelãs disponíveis</label>
                <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0" }}>
                  <li
                    style={{
                      padding: "0.625rem 0.75rem",
                      border: `2px solid ${
                        escolhidaIndex === -1
                          ? "var(--color-primary)"
                          : "var(--color-bg)"
                      }`,
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "0.5rem",
                      cursor: "pointer",
                      background:
                        escolhidaIndex === -1
                          ? "var(--color-bg)"
                          : "var(--color-surface)",
                    }}
                    onClick={() => setEscolhidaIndex(-1)}
                  >
                    <strong>Todas as tecelãs</strong>
                    <p
                      className="field__hint"
                      style={{ margin: "0.25rem 0 0" }}
                    >
                      Pede aula a todas — a primeira que responder prepara o padrão.
                    </p>
                  </li>

                  {avalistas.map((av, idx) => (
                    <li
                      key={av.id ?? idx}
                      style={{
                        padding: "0.625rem 0.75rem",
                        border: `2px solid ${
                          escolhidaIndex === idx
                            ? "var(--color-primary)"
                            : "var(--color-bg)"
                        }`,
                        borderRadius: "var(--radius-sm)",
                        marginBottom: "0.5rem",
                        cursor: "pointer",
                        background:
                          escolhidaIndex === idx
                            ? "var(--color-bg)"
                            : "var(--color-surface)",
                      }}
                      onClick={() => setEscolhidaIndex(idx)}
                    >
                      <strong>{truncarNpub(av.npub_avaliadora)}</strong>
                      {av.is_shadow && (
                        <span
                          className="field__hint"
                          style={{ marginLeft: "0.5rem" }}
                        >
                          (sombra)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                className="btn btn--primary"
                onClick={handlePedirAjuda}
              >
                Pedir aula
              </button>
              <button
                className="btn btn--secondary"
                onClick={() => setPhase("input")}
                style={{ marginTop: "0.5rem" }}
              >
                Voltar
              </button>
            </div>
          </>
        )}

        {/* Estado 4 — Enviando pedido (loading) */}
        {phase === "enviando" && (
          <div className="recover__status">
            <span className="spinner" />
            <p className="recover__status-text">Enviando o pedido à tecelã...</p>
          </div>
        )}

        {/* Estado 5 — Pedido publicado, aguardar scanner */}
        {phase === "aguardando" && (
          <>
            <h1 className="onboarding__title">Aula solicitada</h1>
            <p className="onboarding__tagline">
              Aguarde a tecelã preparar o padrão e escaneie quando ela
              compartilhar.
            </p>

            <div className="onboarding__form">
              <button
                className="btn btn--primary"
                onClick={handleIrParaScanner}
              >
                Escanear padrão
              </button>
              <button
                className="btn btn--secondary"
                onClick={onBack}
                style={{ marginTop: "0.5rem" }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}

        {/* Estado 6 — Erro */}
        {phase === "erro" && (
          <>
            <h1 className="onboarding__title">Não foi dessa vez</h1>
            <p className="onboarding__tagline">
              {errorMsg ||
                "Não conseguimos enviar o pedido agora. Tente novamente."}
            </p>

            <div className="onboarding__form">
              <button className="btn btn--primary" onClick={handleTentarDeNovo}>
                Tentar de novo
              </button>
              <button
                className="btn btn--secondary"
                onClick={onBack}
                style={{ marginTop: "0.5rem" }}
              >
                Voltar
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
