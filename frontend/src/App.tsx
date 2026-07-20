/** Main app — roteador simples por path + máquina de estados do onboarding.

  Routes:
    /                    → fluxo normal (splash num aparelho novo, desenho do
                           Ponto Arakne num aparelho que já tem conta)
    /convite/{codigo}    → mesmo fluxo, mas um aparelho novo vê uma tela de
                           aceitar/recusar o convite antes de criar a conta

  Onboarding (aparelho novo, sem identidade Nostr armazenada):
    splash → createAccount → recoverySetup → catalog
    (com convite:) inviteDecision → createAccount → recoverySetup → catalog

  A antiga BackupPage (que mostrava o mnemonic BIP-39) foi removida na
  Fase 5 — substituída pela RecoverySetupPage (Track 3C, Fase 3), que
  configura avalistas e distribui shares SSSS via NIP-59.

  Aparelho que já tem conta (identidade Nostr no localStorage):
    patternLogin (uma vez por aba) → catalog

  A camada financeira é revelada pela "aula 1 do nível 1" da trilha #9
  (Ponto Arakne): desenhar o padrão correto destrava a FinancialPage.
  Não há mais gesto de busca secreto na SearchBar.
*/


import { useState, useEffect } from "react";
import TrilhasPage from "./pages/TrilhasPage";
import TrilhaDetailPage from "./pages/TrilhaDetailPage";
import AulaPage from "./pages/AulaPage";
import DecoyPage from "./pages/DecoyPage";
import FinancialPage from "./pages/FinancialPage";
import ExtratoPage from "./pages/ExtratoPage";
import ComunidadePage from "./pages/ComunidadePage";
import ComingSoonPage from "./pages/ComingSoonPage";
import PerfilPage from "./pages/PerfilPage";
import MeuQRCodePage from "./pages/MeuQRCodePage";
import ScannerQRPage from "./pages/ScannerQRPage";
import SemConexaoPage from "./pages/SemConexaoPage";
import InviteDecisionPage from "./pages/InviteDecisionPage";
import SplashPage from "./pages/onboarding/SplashPage";
import CreateAccountPage from "./pages/onboarding/CreateAccountPage";
import RecoverySetupPage from "./pages/onboarding/RecoverySetupPage";
import PatternLoginPage from "./pages/onboarding/PatternLoginPage";
import RecoverAccountPage from "./pages/onboarding/RecoverAccountPage";
import DemoSetupPage from "./pages/DemoSetupPage";
import type { NavTarget } from "./components/BottomNav";
import type { Aula } from "./types";
import { isUnlockedThisSession } from "./api";
import { hasStoredIdentity } from "./lib/pattern-storage";
import { useRecoveryListener } from "./hooks/useRecoveryListener";

type View =
  | "loading"
  | "splash"
  | "inviteDecision"
  | "createAccount"
  | "recoverySetup"
  | "patternLogin"
  | "recoverAccount"
  | "demoSetup"
  | "catalog"
  | "trilhaDetail"
  | "aula"
  | "comunidade"
  | "projetos"
  | "perfil"
  | "financial"
  | "extrato"
  | "meuQRCode"
  | "scannerQR"
  | "decoy";

const NAV_TO_VIEW: Record<NavTarget, View> = {
  catalog: "catalog",
  comunidade: "comunidade",
  projetos: "projetos",
  perfil: "perfil",
};

function getInviteCodigo(): string | null {
  const match = window.location.pathname.match(/^\/convite\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** True se a URL atual é /demo-setup (página de setup da demo do júri). */
function isDemoSetupPath(): boolean {
  return window.location.pathname === "/demo-setup";
}

export default function App() {
  // Bootstrap síncrono: se a URL é /demo-setup, já nascemos no demoSetup —
  // evita piscar a tela de onboarding (ou cair em patternLogin quando há
  // identidade armazenada) antes do useEffect corrigir.
  const [view, setView] = useState<View>(() =>
    isDemoSetupPath() ? "demoSetup" : "loading"
  );
  const [inviteCodigo] = useState<string | null>(getInviteCodigo());
  // Whether the person explicitly accepted the invite on the decision
  // screen — if false, CreateAccountPage gets no invite code at all.
  const [usarConvite, setUsarConvite] = useState(false);
  // Transient — only held in memory between "Criar conta" e a próxima
  // tela do onboarding. O npub (chave pública bech32) é o identificador
  // de backup; nunca é persistido. O nsec (chave privada bech32) só
  // existe em memória entre CreateAccountPage e RecoverySetupPage — ele
  // é necessário para assinar os seals NIP-59 das shares endereçadas
  // aos avalistas. NUNCA vai ao backend, NUNCA é persistido em plaintext.
  const [pendingNpub, setPendingNpub] = useState<string | null>(null);
  const [pendingNsec, setPendingNsec] = useState<string | null>(null);
  // PIN gerado em criarConta (CreateAccountPage/AulaPage) — passado à
  // RecoverySetupPage para criptografar a share 1 antes de enviar ao
  // backend (Opção E). A dona anota esse PIN como "código de reserva".
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  // Identidade destravada em memória após o PatternLogin. Guardamos o
  // nsec (bytes) e o padrão para iniciar o listener de recuperação
  // (Pendência 3: a usuária pode ser convidadora de outra dona e precisa
  // receber shards e responder pedidos enquanto a sessão estiver
  // ativa). Limpos no logout.
  const [unlockedNsec, setUnlockedNsec] = useState<Uint8Array | null>(null);
  const [unlockedPattern, setUnlockedPattern] = useState<number[] | null>(null);
  // Set when ScannerQRPage successfully reads a code — consumed once by
  // FinancialPage to pre-fill the troca form, then cleared.
  const [scannedIdentificador, setScannedIdentificador] = useState<string | null>(null);
  // Trilha/aula navigation state for the learning trails.
  const [selectedTrilhaId, setSelectedTrilhaId] = useState<number | null>(null);
  const [selectedAula, setSelectedAula] = useState<Aula | null>(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Listener de recuperação (Pendência 3) ─────────────────
  // Roda em background enquanto a sessão está destravada. A usuária
  // pode ser convidadora de outra dona — o listener recebe shards
  // (distribuídas no onboarding da dona) e responde a pedidos de
  // recuperação automaticamente, usando o cache populado em
  // `loadSharesIntoCache` (dentro do hook). Os pedidos recebidos são
  // expostos para futura UI de notificação (Track 4D).
  useRecoveryListener(
    unlockedNsec !== null,
    unlockedNsec,
    unlockedPattern,
  );

  // ── Bootstrap: decide which screen to land on ──────────────
  // A identidade Nostr (nsec criptografado no localStorage) é a fonte de
  // verdade. Se existe, pede o desenho; senão, vai ao onboarding.
  // Exceção: /demo-setup sempre mostra a DemoSetupPage, independente de
  // identidade armazenada (a pessoa da demo pode rodar o setup várias vezes).
  useEffect(() => {
    if (isDemoSetupPath()) {
      setView("demoSetup");
      return;
    }
    if (hasStoredIdentity()) {
      setView(isUnlockedThisSession() ? "catalog" : "patternLogin");
    } else {
      setView(inviteCodigo ? "inviteDecision" : "splash");
    }
  }, [inviteCodigo]);

  // Handle browser back button — only meaningful once inside the app
  // (revealed screens return to the catalog; onboarding steps manage
  // their own back buttons instead).
  useEffect(() => {
    const handler = () => {
      setView((current) =>
        ["financial", "extrato", "meuQRCode", "scannerQR", "decoy", "comunidade", "projetos", "perfil", "trilhaDetail", "aula"].includes(current)
          ? "catalog"
          : current
      );
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (view === "loading") {
    return null;
  }

  if (view === "demoSetup") {
    return (
      <DemoSetupPage
        onDone={() => setView("catalog")}
      />
    );
  }

  if (!isOnline) {
    return <SemConexaoPage />;
  }

  if (view === "splash") {
    return (
      <SplashPage
        onCreateAccount={() => setView("createAccount")}
        onHaveAccount={() => setView("patternLogin")}
      />
    );
  }

  if (view === "inviteDecision") {
    return (
      <InviteDecisionPage
        onAceitar={() => {
          setUsarConvite(true);
          setView("createAccount");
        }}
        onRecusar={() => {
          setUsarConvite(false);
          setView("createAccount");
        }}
      />
    );
  }

  if (view === "createAccount") {
    return (
      <CreateAccountPage
        inviteCodigo={usarConvite ? inviteCodigo : null}
        onBack={() => setView(inviteCodigo ? "inviteDecision" : "splash")}
        onCreated={(npub, nsec, pin) => {
          setPendingNpub(npub);
          setPendingNsec(nsec);
          setPendingPin(pin);
          setView("recoverySetup");
        }}
      />
    );
  }

  if (view === "recoverySetup" && pendingNpub && pendingNsec && pendingPin) {
    return (
      <RecoverySetupPage
        npub={pendingNpub}
        nsec={pendingNsec}
        pin={pendingPin}
        onBack={() => setView("createAccount")}
        onDone={() => {
          setPendingNpub(null);
          setPendingNsec(null);
          setPendingPin(null);
          setView("catalog");
        }}
      />
    );
  }

  if (view === "patternLogin") {
    return (
      <PatternLoginPage
        onUnlocked={(nsec, pattern) => {
          setUnlockedNsec(nsec);
          setUnlockedPattern(pattern);
          setView("catalog");
        }}
        onCreateAccount={() => setView("createAccount")}
        onForgotPattern={() => setView("recoverAccount")}
      />
    );
  }

  if (view === "recoverAccount") {
    return (
      <RecoverAccountPage
        onRecovered={() => setView("catalog")}
        onBack={() => setView("patternLogin")}
      />
    );
  }

  if (view === "financial") {
    return (
      <FinancialPage
        onBack={() => setView("catalog")}
        onVerExtrato={() => setView("extrato")}
        onAbrirScanner={() => setView("scannerQR")}
        prefilledPontoIdentificador={scannedIdentificador}
        onPrefillConsumed={() => setScannedIdentificador(null)}
      />
    );
  }

  if (view === "extrato") {
    return <ExtratoPage onBack={() => setView("financial")} />;
  }

  if (view === "scannerQR") {
    return (
      <ScannerQRPage
        onBack={() => setView("financial")}
        onScanned={(identificador) => {
          setScannedIdentificador(identificador);
          setView("financial");
        }}
      />
    );
  }

  if (view === "meuQRCode") {
    return <MeuQRCodePage onBack={() => setView("perfil")} />;
  }

  if (view === "decoy") {
    return <DecoyPage onBack={() => setView("catalog")} />;
  }

  if (view === "comunidade") {
    return <ComunidadePage onNavigate={(t) => setView(NAV_TO_VIEW[t])} />;
  }

  if (view === "projetos") {
    return <ComingSoonPage active="projetos" title="Meus Projetos" onNavigate={(t) => setView(NAV_TO_VIEW[t])} />;
  }

  if (view === "perfil") {
    return (
      <PerfilPage
        onNavigate={(t) => setView(NAV_TO_VIEW[t])}
        onLoggedOut={() => {
          // Limpa a identidade destravada — o listener de recuperação
          // para (effect cleanup) e o cache em memória é limpo pelo
          // PerfilPage via `clearSharesCache()`.
          setUnlockedNsec(null);
          setUnlockedPattern(null);
          setView("splash");
        }}
        onVerMeuCodigo={() => setView("meuQRCode")}
      />
    );
  }

  if (view === "trilhaDetail" && selectedTrilhaId !== null) {
    return (
      <TrilhaDetailPage
        trilhaId={selectedTrilhaId}
        onBack={() => setView("catalog")}
        onOpenAula={(aula) => {
          setSelectedAula(aula);
          setView("aula");
        }}
        onNavigate={(t) => setView(NAV_TO_VIEW[t])}
      />
    );
  }

  if (view === "aula" && selectedAula) {
    return (
      <AulaPage
        aula={selectedAula}
        onBack={() => setView("trilhaDetail")}
        onConcluida={() => setView("trilhaDetail")}
        onNavigate={(t) => setView(NAV_TO_VIEW[t])}
        onRevealFinancial={() => setView("financial")}
        onGoToRecoverySetup={(npub, nsec, pin) => {
          setPendingNpub(npub);
          setPendingNsec(nsec);
          setPendingPin(pin);
          setView("recoverySetup");
        }}
      />
    );
  }

  return (
    <TrilhasPage
      onRevealDecoy={() => setView("decoy")}
      onNavigate={(t) => setView(NAV_TO_VIEW[t])}
      onOpenTrilha={(id) => {
        setSelectedTrilhaId(id);
        setView("trilhaDetail");
      }}
      inviteCodigo={inviteCodigo}
    />
  );
}
