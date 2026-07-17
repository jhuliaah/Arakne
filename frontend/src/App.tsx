/** Main app — simple path-based router + onboarding state machine.

  Routes:
    /                    → normal flow (splash on a brand-new device, PIN
                           unlock on a returning one)
    /convite/{codigo}    → same flow, but a brand-new device sees a real
                           accept/decline decision screen first, instead of
                           silently being vouched for

  Onboarding states (brand-new device, no identificador saved locally):
    splash → createAccount → backup → catalog
    (invite link:) inviteDecision → createAccount → backup → catalog

  Returning device (identificador already saved locally):
    pinLogin (once per browser tab session) → catalog
    pinLogin → "esqueci meu PIN" → recovery → catalog

  Three more views are revealed by search gestures from inside the catalog
  (not URL navigation):
  - "Ponto Arakne"       → Financial screen (real, disguised)
  - "Galeria de Padrões" → Decoy catalog (looks real, zero financial traces)
  - Any other query      → Normal pattern filter
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
import PinLoginPage from "./pages/onboarding/PinLoginPage";
import RecoveryPage from "./pages/onboarding/RecoveryPage";
import type { NavTarget } from "./components/BottomNav";
import type { Aula } from "./types";
import { getIdentificador, isUnlockedThisSession } from "./api";

type View =
  | "loading"
  | "splash"
  | "inviteDecision"
  | "createAccount"
  | "backup"
  | "pinLogin"
  | "recovery"
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
  // The PIN is deliberately never written to localStorage.
  const [pendingCreds, setPendingCreds] = useState<{ identificador: string; pin: string } | null>(null);
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
  useEffect(() => {
    const ident = getIdentificador();
    if (ident) {
      setView(isUnlockedThisSession() ? "catalog" : "pinLogin");
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
        onHaveAccount={() => setView("recovery")}
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
        onCreated={(identificador, pin) => {
          setPendingCreds({ identificador, pin });
          setView("backup");
        }}
      />
    );
  }

  if (view === "backup" && pendingCreds) {
    return (
      <BackupPage
        identificador={pendingCreds.identificador}
        pin={pendingCreds.pin}
        onDone={() => {
          setPendingCreds(null);
          setView("catalog");
        }}
      />
    );
  }

  if (view === "pinLogin") {
    const ident = getIdentificador();
    if (!ident) {
      // Shouldn't happen, but fall back gracefully instead of a dead end.
      setView("splash");
      return null;
    }
    return (
      <PinLoginPage
        identificador={ident}
        onUnlocked={() => setView("catalog")}
        onForgotPin={() => setView("recovery")}
      />
    );
  }

  if (view === "recovery") {
    return (
      <RecoveryPage
        onBack={() => setView(getIdentificador() ? "pinLogin" : "splash")}
        onRecovered={() => setView("catalog")}
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
      />
    );
  }

  return (
    <TrilhasPage
      onRevealFinancial={() => setView("financial")}
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
