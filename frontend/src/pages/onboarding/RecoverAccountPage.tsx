/** RecoverAccountPage — recuperação de conta em novo dispositivo.
 *
 *  Track 4D da Fase 4 do plano de recuperação Nostr do Arakne (Opção E).
 *
 *  Cenário: a usuária perdeu o aparelho (ou esqueceu o Ponto Arakne),
 *  está num dispositivo novo, e sabe o `identificador` do seu ateliê +
 *  seu PIN (o "código de reserva" anotado na configuração). Esta tela
 *  orquestra o fluxo de recuperação social:
 *
 *    1. Ela informa o identificador do ateliê e seu PIN.
 *    2. `startRecoveryRequest(identificador, pin)` faz login no backend
 *       com o PIN, busca a share 1 (decripta com o PIN) e gift-wrap um
 *       pedido NIP-59 à convidadora (se houver), usando um nsec efêmero.
 *    3. `subscribeToRecoveryResponses(ephemeralNsec, ...)` escuta
 *       gift-wraps de resposta no npub efêmero. A convidadora que aprova
 *       devolve a share 0 SSSS.
 *    4. Quando 2 shares chegam (share 1 do backend + share 0 da
 *       convidadora), a usuária desenha um NOVO Ponto Arakne.
 *       `tryCombineShares` reconstrói o nsec original e valida o pubkey
 *       contra o npub da dona (buscado no backend).
 *    5. `adoptRecoveredIdentity(recoveredNsec, newPattern)` re-criptografa
 *       o nsec com o novo padrão e guarda no localStorage. A sessão é
 *       destravada e o App vai para o catálogo.
 *
 *  Fallback E′ (sem convidadora): se o backend não retornar convidadora
 *  (0 avalistas), a dona precisa colar o "código de reserva de papel"
 *  (share 0 em base64, anotada manualmente na configuração). A UI
 *  decodifica e combina com a share 1 do backend.
 *
 *  Disfarce: vocabulário de crochê/tecelagem alinhado ao copy deck.
 *  "Reatar fios" = recuperar conta. "Tecelãs" = avalistas. "Fios" =
 *  shares SSSS. "Ponto Arakne" = padrão de desbloqueio. "Código de
 *  reserva" = PIN (para o backend) ou share 0 em base64 (paper backup).
 *  Nenhuma palavra-chave de segurança/criptografia aparece no copy.
 *
 *  Modelo de ameaça: o nsec efêmero nunca sai do dispositivo. O nsec
 *  reconstruído é re-criptografado imediatamente com o novo padrão e
 *  nunca é persistido em plaintext. O npub da dona (público) é buscado
 *  no backend pelo identificador — não vaza informação nova.
 */

import { useEffect, useRef, useState } from "react";
import Header from "../../components/Header";
import HexPatternCanvas from "../../components/HexPatternCanvas";
import { markUnlockedThisSession, getNpubByIdentificador } from "../../api";
import {
  startRecoveryRequest,
  subscribeToRecoveryResponses,
  tryCombineShares,
  type RecoveryRequestResult,
  type RecoveryResponse,
} from "../../lib/recovery-request";
import { adoptRecoveredIdentity, resetFailedAttempts } from "../../lib/pattern-storage";
import { base64ToBytes } from "../../lib/recovery-serialize";

interface RecoverAccountPageProps {
  /** Chamado quando o nsec foi recuperado, guardado e a sessão destravada. */
  onRecovered: () => void;
  /** Volta para PatternLoginPage. */
  onBack: () => void;
}

/** Estados da máquina de recuperação. */
type Phase =
  | "input" // Estado 1: input do identificador + PIN
  | "searching" // Estado 2: procurando tecelãs (loading)
  | "waiting" // Estado 3: aguardando respostas
  | "newPattern" // Estado 4: desenhar novo Ponto Arakne
  | "error"; // Estado 5: erro

/** Threshold SSSS (M=2 de N=2 — Opção E). */
const THRESHOLD = 2;
/** Timeout máximo de espera por respostas (ms). */
const RESPONSE_TIMEOUT_MS = 60_000;

export default function RecoverAccountPage({
  onRecovered,
  onBack,
}: RecoverAccountPageProps) {
  const [phase, setPhase] = useState<Phase>("input");
  const [identificador, setIdentificador] = useState("");
  const [pin, setPin] = useState("");
  const [paperBackup, setPaperBackup] = useState("");
  const [responses, setResponses] = useState<RecoveryResponse[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [combining, setCombining] = useState(false);
  // Indica se a share 1 do backend foi recuperada com sucesso.
  const [backendShareOk, setBackendShareOk] = useState(false);
  // Indica se há convidadora (1 avalista) ou não (0 — paper backup).
  const [hasConvidadora, setHasConvidadora] = useState(true);

  // Guarda o resultado do pedido (nsec efêmero + npub esperado da dona +
  // share 1 do backend) entre os estados. Refs porque não precisam
  // re-renderizar.
  const requestResultRef = useRef<RecoveryRequestResult | null>(null);
  const expectedOwnerNpubRef = useRef<string | null>(null);
  const backendShareRef = useRef<Uint8Array | null>(null);

  // Cleanup do subscribe e do timeout — guardados em refs para chamar
  // no unmount ou ao cancelar.
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // ── Cleanup no unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // ── Estado 2: dispara o pedido ao backend + relays ─────────
  async function handleSearch() {
    const id = identificador.trim();
    const pinTrim = pin.trim();
    if (!id) {
      setErrorMsg("Informe o identificador do seu ateliê.");
      setPhase("error");
      return;
    }
    if (!pinTrim) {
      setErrorMsg("Informe seu código de reserva (PIN).");
      setPhase("error");
      return;
    }

    setPhase("searching");
    setErrorMsg("");

    try {
      const result = await startRecoveryRequest(id, pinTrim);
      requestResultRef.current = result;
      backendShareRef.current = result.backendShare;
      setBackendShareOk(result.backendShare !== null);

      // O npub esperado da dona é buscado no backend (endpoint público,
      // sem auth). startRecoveryRequest já valida isso internamente e
      // lança se não encontra, mas não retorna o npub — precisamos dele
      // para o subscribe (validação) e para o combine final. Re-buscamos
      // aqui: chamada idempotente e barata.
      const ownerNpub = await getNpubByIdentificador(id);
      if (!ownerNpub) {
        setErrorMsg("Não encontramos seu ateliê. Confira o identificador.");
        setPhase("error");
        return;
      }
      expectedOwnerNpubRef.current = ownerNpub;

      // Decide se há convidadora: se published > 0, o pedido NIP-59 foi
      // entregue a alguém. Se published === 0, não há convidadora — a
      // dona precisa usar o paper backup (fallback E′).
      setHasConvidadora(result.published > 0);

      // Se não há convidadora e a share 1 do backend veio, vamos direto
      // ao estado de espera pelo paper backup (sem subscribe NIP-59).
      if (result.published === 0) {
        if (result.backendShare) {
          // Sem convidadora — dona precisa colar o código de papel.
          setResponses([]);
          setPhase("waiting");
          // Sem subscribe nem timeout: a dona vai colar o paper backup.
          return;
        }
        // Nem backend nem convidadora — não dá para recuperar.
        setErrorMsg(
          "Não conseguimos reatar seus fios agora. Confira o identificador e o código de reserva.",
        );
        setPhase("error");
        return;
      }

      // Publicou em ≥1 relay — vai para o estado de espera.
      setResponses([]);
      setPhase("waiting");
      startWaitingForResponses();
    } catch (err) {
      console.error("[RecoverAccountPage] startRecoveryRequest falhou:", err);
      setErrorMsg(
        "Não conseguimos reatar seus fios agora. Confira o identificador e o código de reserva.",
      );
      setPhase("error");
    }
  }

  // ── Estado 3: inscreve para receber respostas + timeout ────
  function startWaitingForResponses() {
    const result = requestResultRef.current;
    const ownerNpub = expectedOwnerNpubRef.current;
    if (!result || !ownerNpub) return;

    const cleanup = subscribeToRecoveryResponses(
      result.ephemeralNsec,
      (response) => {
        setResponses((prev) => {
          // Evita duplicatas (mesma convidadora respondendo 2x).
          if (prev.some((r) => r.avalistaNpub === response.avalistaNpub)) {
            return prev;
          }
          const next = [...prev, response];
          // Quando atingir o threshold (considerando a share do backend),
          // vai para o estado 4.
          const totalShares =
            (backendShareRef.current ? 1 : 0) + next.length;
          if (totalShares >= THRESHOLD) {
            // Para de escutar — já temos o suficiente.
            if (unsubscribeRef.current) {
              unsubscribeRef.current();
              unsubscribeRef.current = null;
            }
            if (timeoutRef.current !== null) {
              window.clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setPhase("newPattern");
          }
          return next;
        });
      },
      ownerNpub,
    );
    unsubscribeRef.current = cleanup;

    // Timeout: se não receber respostas a tempo, mostra mensagem clara.
    timeoutRef.current = window.setTimeout(() => {
      setResponses((prev) => {
        const totalShares = (backendShareRef.current ? 1 : 0) + prev.length;
        if (totalShares < THRESHOLD) {
          setErrorMsg(
            "Aguardando suas tecelãs responderem... Tente novamente mais tarde, ou use seu código de reserva de papel.",
          );
          setPhase("error");
        }
        return prev;
      });
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      timeoutRef.current = null;
    }, RESPONSE_TIMEOUT_MS);
  }

  function handleCancelWaiting() {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setResponses([]);
    setPhase("input");
  }

  // ── Fallback E′: dona cola o paper backup (share 0 em base64) ──
  function handleUsePaperBackup() {
    const trimmed = paperBackup.trim();
    if (!trimmed) {
      setErrorMsg("Cole o código de reserva de papel que você anotou.");
      setPhase("error");
      return;
    }
    let paperShare: Uint8Array;
    try {
      paperShare = base64ToBytes(trimmed);
    } catch (err) {
      console.error("[RecoverAccountPage] paper backup base64 inválido:", err);
      setErrorMsg("O código de reserva de papel parece inválido. Confira.");
      setPhase("error");
      return;
    }
    // Encapsula como uma "resposta" da convidadora (paper) e avança.
    const paperResponse: RecoveryResponse = {
      avalistaNpub: "paper-backup",
      share: paperShare,
      vaultId: "",
    };
    setResponses([paperResponse]);
    const totalShares = (backendShareRef.current ? 1 : 0) + 1;
    if (totalShares >= THRESHOLD) {
      setPhase("newPattern");
    } else {
      setErrorMsg("Ainda faltam fios. Confira seu código de reserva de papel.");
      setPhase("error");
    }
  }

  // ── Estado 4: combina shares + adota identidade ────────────
  async function handlePatternConfirmed(newPattern: number[]) {
    const ownerNpub = expectedOwnerNpubRef.current;
    if (!ownerNpub) {
      setErrorMsg(
        "Não conseguimos reatar seus fios agora. Tente novamente ou peça ajuda a outra tecelã.",
      );
      setPhase("error");
      return;
    }

    setCombining(true);
    try {
      const recoveredNsec = await tryCombineShares(
        backendShareRef.current,
        responses,
        ownerNpub,
      );
      if (!recoveredNsec) {
        setErrorMsg(
          "Não conseguimos reatar seus fios agora. Tente novamente ou peça ajuda a outra tecelã.",
        );
        setPhase("error");
        return;
      }

      // Re-criptografa o nsec recuperado com o novo padrão e guarda.
      await adoptRecoveredIdentity(recoveredNsec, newPattern);

      // Recuperação bem-sucedida: zera o contador de tentativas falhas
      // do Ponto Arakne (§5.2) — a dona começa um novo ciclo com o novo
      // padrão, sem lockout residual.
      resetFailedAttempts();

      markUnlockedThisSession();
      onRecovered();
    } catch (err) {
      console.error("[RecoverAccountPage] combine/adopt falhou:", err);
      setErrorMsg(
        "Não conseguimos reatar seus fios agora. Tente novamente ou peça ajuda a outra tecelã.",
      );
      setPhase("error");
    } finally {
      setCombining(false);
    }
  }

  function handleTryAgain() {
    // Volta ao estado 1, preservando o identificador digitado (conveniência).
    setResponses([]);
    setErrorMsg("");
    requestResultRef.current = null;
    expectedOwnerNpubRef.current = null;
    backendShareRef.current = null;
    setBackendShareOk(false);
    setHasConvidadora(true);
    setPhase("input");
  }

  // Conta quantos fios já chegaram (para o contador da tela de espera).
  const fiosRecebidos = (backendShareOk ? 1 : 0) + responses.length;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <button className="onboarding__back" onClick={onBack}>
          ← Voltar
        </button>

        {/* Estado 1 — Input do identificador + PIN */}
        {phase === "input" && (
          <>
            <h1 className="onboarding__title">Reatar seus fios</h1>
            <p className="onboarding__tagline">
              Se você perdeu seu Ponto Arakne, suas tecelãs podem te ajudar a
              reatar os fios do seu ateliê.
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
                  disabled={combining}
                />
                <p className="field__hint">
                  É o código que você anotou ao criar sua conta.
                </p>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="pin">
                  Código de reserva (PIN)
                </label>
                <input
                  id="pin"
                  className="field__input"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="4 dígitos"
                  autoComplete="off"
                  disabled={combining}
                />
                <p className="field__hint">
                  É o código de reserva que você anotou ao configurar suas
                  tecelãs.
                </p>
              </div>

              <button
                className="btn btn--primary"
                onClick={handleSearch}
                disabled={!identificador.trim() || !pin.trim()}
              >
                Procurar tecelãs
              </button>
            </div>
          </>
        )}

        {/* Estado 2 — Procurando tecelãs (loading) */}
        {phase === "searching" && (
          <div className="recover__status">
            <span className="spinner" />
            <p className="recover__status-text">Procurando suas tecelãs...</p>
          </div>
        )}

        {/* Estado 3 — Aguardando respostas */}
        {phase === "waiting" && (
          <div className="recover__status">
            <span className="spinner" />
            <p className="recover__status-text">
              {hasConvidadora
                ? "Aguardando suas tecelãs responderem..."
                : "Aguardando seu código de reserva de papel."}
            </p>
            <p className="recover__counter">
              {Math.min(fiosRecebidos, THRESHOLD)} de {THRESHOLD} fios recebidos
            </p>
            {backendShareOk && (
              <p className="field__hint">
                1 fio recuperado do ateliê central.
              </p>
            )}

            {/* Fallback E′: sem convidadora — dona cola o paper backup. */}
            {!hasConvidadora && (
              <div className="onboarding__form" style={{ marginTop: "1rem" }}>
                <div className="field">
                  <label className="field__label" htmlFor="paperBackup">
                    Código de reserva de papel
                  </label>
                  <textarea
                    id="paperBackup"
                    className="field__input"
                    value={paperBackup}
                    onChange={(e) => setPaperBackup(e.target.value)}
                    placeholder="Cole o código que você anotou em papel"
                    rows={3}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <p className="field__hint">
                    É o código longo que você anotou em papel ao configurar
                    suas tecelãs.
                  </p>
                </div>
                <button
                  className="btn btn--primary"
                  onClick={handleUsePaperBackup}
                  disabled={!paperBackup.trim()}
                >
                  Usar código de reserva
                </button>
              </div>
            )}

            {hasConvidadora && (
              <button
                className="btn btn--secondary"
                onClick={handleCancelWaiting}
              >
                Cancelar
              </button>
            )}
          </div>
        )}

        {/* Estado 4 — Desenhar novo padrão */}
        {phase === "newPattern" && (
          <>
            <h1 className="onboarding__title">Fios reatados!</h1>
            <p className="onboarding__tagline">
              Desenhe um novo Ponto Arakne para guardar seu ateliê.
            </p>

            <div style={{ width: "100%", maxWidth: "420px" }}>
              <HexPatternCanvas
                mode="register"
                onPatternConfirmed={handlePatternConfirmed}
              />

              {combining && (
                <p
                  className="field__hint"
                  style={{ textAlign: "center", marginTop: "0.75rem" }}
                >
                  Reatando seus fios...
                </p>
              )}
            </div>
          </>
        )}

        {/* Estado 5 — Erro */}
        {phase === "error" && (
          <>
            <h1 className="onboarding__title">Não foi dessa vez</h1>
            <p className="onboarding__tagline">
              {errorMsg ||
                "Não conseguimos reatar seus fios agora. Tente novamente ou peça ajuda a outra tecelã."}
            </p>

            <div className="onboarding__form">
              <button className="btn btn--primary" onClick={handleTryAgain}>
                Tentar de novo
              </button>
              <button className="btn btn--secondary" onClick={onBack}>
                Voltar
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
