/** Main app — simple path-based router.

  Routes:
    /                    → Catalog (default, self-onboards silently)
    /convite/{codigo}    → Invite (shows catalog, creates aval silently)

  Three views are revealed by search gestures (not URL navigation):
  - "Ponto Arakne"       → Financial screen (real, disguised)
  - "Galeria de Padrões" → Decoy catalog (looks real, zero financial traces)
  - Any other query      → Normal pattern filter
*/

import { useState, useEffect } from "react";
import CatalogPage from "./pages/CatalogPage";
import DecoyPage from "./pages/DecoyPage";
import FinancialPage from "./pages/FinancialPage";
import InvitePage from "./pages/InvitePage";
import { ensureOnboarding } from "./api";

type View = "catalog" | "financial" | "decoy";

function getInviteCodigo(): string | null {
  const match = window.location.pathname.match(/^\/convite\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [view, setView] = useState<View>("catalog");
  const [inviteCodigo] = useState<string | null>(getInviteCodigo());

  // Silent onboarding — creates user + aval in the background
  useEffect(() => {
    let cancelled = false;
    ensureOnboarding(inviteCodigo).then(() => {
      if (!cancelled) return;
    });
    return () => { cancelled = true; };
  }, [inviteCodigo]);

  // Handle browser back button — always returns to catalog
  useEffect(() => {
    const handler = () => setView("catalog");
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (view === "financial") {
    return <FinancialPage onBack={() => setView("catalog")} />;
  }

  if (view === "decoy") {
    return <DecoyPage onBack={() => setView("catalog")} />;
  }

  if (inviteCodigo) {
    return (
      <InvitePage
        codigo={inviteCodigo}
        onRevealFinancial={() => setView("financial")}
        onRevealDecoy={() => setView("decoy")}
      />
    );
  }

  return (
    <CatalogPage
      onRevealFinancial={() => setView("financial")}
      onRevealDecoy={() => setView("decoy")}
    />
  );
}
