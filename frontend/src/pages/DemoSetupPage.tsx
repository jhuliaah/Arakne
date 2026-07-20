/** DemoSetupPage — configura o perfil mestre (Fundadora) para a demo do júri.
 *
 *  Esta página existe para acelerar o reset da demo: em vez de passar pelo
 *  onboarding completo (desenhar Ponto Arakne, criar conta, configurar
 *  recuperação), ela pré-configura a Fundadora em um clique.
 *
 *  Pré-requisito: rodar `python seed_demo.py` no backend (cria a Fundadora
 *  com identificador "FUNDADORA", PIN "1234", tier 3, convite "FUNDADORA_INVITE").
 *
 *  Fluxo:
 *    1. Gera nsec/npub (nostr-tools)
 *    2. Criptografa nsec com padrão conhecido [0,1,2,3,4,5] (AES-GCM + PBKDF2)
 *    3. Faz login da Fundadora (POST /login com FUNDADORA/1234)
 *    4. Atualiza o npub da Fundadora no backend (PATCH /usuarias/me/npub)
 *    5. Guarda tudo no localStorage (token, identificador, PIN, nsec
 *       criptografado, pattern hash, npub, recovery_distributed=1)
 *    6. Mostra tela de sucesso com identificador, PIN, convite e padrão
 *
 *  O padrão [0,1,2,3,4,5] são os 6 vértices do primeiro hexágono do
 *  HexPatternCanvas (cantos no sentido horário, começando do topo).
 *  A pessoa da demo precisa desenhar essa sequência para entrar no app.
 */

import { useState } from "react";
import Header from "../components/Header";
import { login, setToken, setIdentificador, setPin, markUnlockedThisSession, updateNpub } from "../api";
import { createNostrIdentity, decodeNsec } from "../lib/nostr-keys";
import { encryptNsec, hashPattern } from "../lib/pattern-crypto";

/** Padrão fixo da demo: 6 vértices do primeiro hexágono (horário, do topo).
 *  Em login mode o HexPatternCanvas não exige minLength (só register mode),
 *  então 6 pontos é suficiente para destravar. */
const DEMO_PATTERN: number[] = [0, 1, 2, 3, 4, 5];

/** Credenciais fixas da Fundadora (criadas por seed_demo.py). */
const FUNDADORA_IDENTIFICADOR = "FUNDADORA";
const FUNDADORA_PIN = "1234";
const FUNDADORA_INVITE = "FUNDADORA_INVITE";

interface DemoSetupPageProps {
  /** Chamado quando o setup termina e a pessoa clica em "Ir para o app". */
  onDone: () => void;
}

type SetupState =
  | { status: "idle" }
  | { status: "running"; step: string }
  | { status: "error"; message: string }
  | { status: "success"; npub: string };

export default function DemoSetupPage({ onDone }: DemoSetupPageProps) {
  const [state, setState] = useState<SetupState>({ status: "idle" });

  async function handleSetup() {
    try {
      // 1. Gera identidade Nostr (nsec + npub)
      setState({ status: "running", step: "Gerando identidade Nostr..." });
      const identity = createNostrIdentity();
      const nsecBytes = decodeNsec(identity.nsec);

      // 2. Criptografa nsec com o padrão fixo da demo
      setState({ status: "running", step: "Criptografando nsec..." });
      const encryptedBlob = await encryptNsec(nsecBytes, DEMO_PATTERN);

      // 3. Hash do padrão (check rápido antes do PBKDF2 no login)
      setState({ status: "running", step: "Calculando hash do padrão..." });
      const patternHash = await hashPattern(DEMO_PATTERN);

      // 4. Login da Fundadora (POST /login)
      setState({ status: "running", step: "Fazendo login da Fundadora..." });
      const loginResp = await login(FUNDADORA_IDENTIFICADOR, FUNDADORA_PIN);
      if (!loginResp) {
        setState({
          status: "error",
          message: "Falha no login da Fundadora. Você rodou `python seed_demo.py` no backend?",
        });
        return;
      }

      // 5. Atualiza o npub da Fundadora no backend (PATCH /usuarias/me/npub)
      setState({ status: "running", step: "Atualizando npub no backend..." });
      const updated = await updateNpub(loginResp.token, identity.npub);
      if (!updated) {
        setState({
          status: "error",
          message: "Falha ao atualizar npub. Verifique se o backend está rodando.",
        });
        return;
      }

      // 6. Guarda tudo no localStorage
      setState({ status: "running", step: "Salvando credenciais..." });
      setToken(loginResp.token);
      setIdentificador(FUNDADORA_IDENTIFICADOR);
      setPin(FUNDADORA_PIN);
      localStorage.setItem("arakne_nsec_encrypted", encryptedBlob);
      localStorage.setItem("arakne_pattern_hash", patternHash);
      localStorage.setItem("arakne_npub", identity.npub);
      localStorage.setItem("arakne_recovery_distributed", "1");
      // Marca a sessão como destravada para pular o PatternLogin no bootstrap
      markUnlockedThisSession();

      // 7. Limpa a URL para que reloads vão ao app, não a esta página
      window.history.replaceState({}, "", "/");

      setState({ status: "success", npub: identity.npub });
    } catch (err) {
      setState({
        status: "error",
        message: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  function handleGoToApp() {
    onDone();
  }

  // ── Tela de sucesso ──────────────────────────────────────────
  if (state.status === "success") {
    return (
      <div className="page">
        <Header />
        <main className="onboarding onboarding--centered">
          <div className="onboarding__glyph">🕸️</div>
          <h1 className="onboarding__title">Perfil mestre configurado!</h1>
          <p className="onboarding__tagline">
            A Fundadora está pronta para a demo. Anote os dados abaixo:
          </p>

          <div className="onboarding__form" style={{ textAlign: "left", gap: "0.75rem" }}>
            <div className="demo-setup__field">
              <strong>Identificador:</strong> {FUNDADORA_IDENTIFICADOR}
            </div>
            <div className="demo-setup__field">
              <strong>PIN:</strong> {FUNDADORA_PIN}
            </div>
            <div className="demo-setup__field">
              <strong>Convite:</strong> {FUNDADORA_INVITE}
              <br />
              <span className="field__hint">
                Link: /convite/{FUNDADORA_INVITE}
              </span>
            </div>
            <div className="demo-setup__field">
              <strong>Padrão (Ponto Arakne):</strong>
              <br />
              <span className="demo-setup__pattern">0 → 1 → 2 → 3 → 4 → 5</span>
              <br />
              <span className="field__hint">
                Desenhe os 6 vértices do primeiro hexágono no sentido
                horário, começando do topo. Necessário para entrar no app
                após recarregar a página.
              </span>
            </div>
            <div className="demo-setup__field">
              <strong>npub:</strong>
              <br />
              <code className="demo-setup__npub">{state.npub}</code>
            </div>
          </div>

          <div className="onboarding__form">
            <button className="btn btn--primary" onClick={handleGoToApp}>
              Ir para o app
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Tela de erro ─────────────────────────────────────────────
  if (state.status === "error") {
    return (
      <div className="page">
        <Header />
        <main className="onboarding onboarding--centered">
          <div className="onboarding__glyph">⚠️</div>
          <h1 className="onboarding__title">Erro na configuração</h1>
          <p className="onboarding__tagline">{state.message}</p>
          <div className="onboarding__form">
            <button className="btn btn--primary" onClick={() => setState({ status: "idle" })}>
              Tentar de novo
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Tela inicial / em execução ───────────────────────────────
  return (
    <div className="page">
      <Header />
      <main className="onboarding onboarding--centered">
        <div className="onboarding__glyph">🧶</div>
        <h1 className="onboarding__title">Demo Arakne — Setup</h1>
        <p className="onboarding__tagline">
          Configura o perfil mestre (Fundadora) em um clique. Pré-requisito:
          rodar <code>python seed_demo.py</code> no backend.
        </p>

        <div className="onboarding__form">
          <button
            className="btn btn--primary"
            onClick={handleSetup}
            disabled={state.status === "running"}
          >
            {state.status === "running" ? state.step : "Configurar perfil mestre (demo)"}
          </button>
        </div>

        {state.status === "running" && (
          <p className="field__hint" style={{ textAlign: "center", marginTop: "0.75rem" }}>
            Aguarde — gerando chaves e conectando ao backend...
          </p>
        )}
      </main>
    </div>
  );
}
