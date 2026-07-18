/** Main app — roteador simples por path + máquina de estados do onboarding.

  Routes:
    /                    → fluxo normal (splash num aparelho novo, desenho do
                           Ponto Arakne num aparelho que já tem conta)
    /convite/{codigo}    → mesmo fluxo, mas um aparelho novo vê uma tela de
                           aceitar/recusar o convite antes de criar a conta

  Onboarding (aparelho novo, sem identidade Nostr armazenada):
    splash → createAccount → backup → catalog
    (com convite:) inviteDecision → createAccount → backup → catalog

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
import BackupPage from "./pages/onboarding/BackupPage";
import PatternLoginPage from "./pages/onboarding/PatternLoginPage";
import type { NavTarget } from "./components/BottomNav";
import type { Aula } from "./types";
import { isUnlockedThisSession } from "./api";
import { hasStoredIdentity } from "./lib/pattern-storage";

type View =
  | "loading"
  | "splash"
  | "inviteDecision"
  | "createAccount"
  | "backup"
  | "patternLogin"
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

export default function App() {
  const [view, setView] = useState<View>("loading");
  const [inviteCodigo] = useState<string | null>(getInviteCodigo());
  // Whether the person explicitly accepted the invite on the decision
  // screen — if false, CreateAccountPage gets no invite code at all.
  const [usarConvite, setUsarConvite] = useState(false);
  // Transient — only held in memory between "Criar conta" and "Backup".
  // O mnemonic BIP-39 (12 palavras) é o backup único; nunca é persistido.
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
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

  // ── Bootstrap: decide which screen to land on ──────────────
  // A identidade Nostr (nsec criptografado no localStorage) é a fonte de
  // verdade. Se existe, pede o desenho; senão, vai ao onboarding.
  useEffect(() => {
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
        onCreated={(mnemonic) => {
          setPendingMnemonic(mnemonic);
          setView("backup");
        }}
      />
    );
  }

  if (view === "backup" && pendingMnemonic) {
    return (
      <BackupPage
        mnemonic={pendingMnemonic}
        onDone={() => {
          setPendingMnemonic(null);
          setView("catalog");
        }}
      />
    );
  }

  if (view === "patternLogin") {
    return (
      <PatternLoginPage
        onUnlocked={() => setView("catalog")}
        onCreateAccount={() => setView("createAccount")}
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
        onLoggedOut={() => setView("splash")}
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
        onGoToBackup={(mnemonic) => {
          setPendingMnemonic(mnemonic);
          setView("backup");
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
