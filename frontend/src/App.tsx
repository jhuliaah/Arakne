/** Main app — simple path-based router.

  Routes:
    /                    → Catalog (default, self-onboards silently)
    /convite/{codigo}    → Invite (shows catalog, creates aval silently)
  The financial screen is revealed by the search gesture (typing "Ponto Arakne"),
  not by URL navigation.
*/

import { useState, useEffect } from "react";
import CatalogPage from "./pages/CatalogPage";
import FinancialPage from "./pages/FinancialPage";
import InvitePage from "./pages/InvitePage";
import { ensureOnboarding } from "./api";

type View = "catalog" | "financial";

function getInviteCodigo(): string | null {
  const match = window.location.pathname.match(/^\/convite\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function App() {
  const [view, setView] = useState<View>("catalog");
  const [inviteCodigo] = useState<string | null>(getInviteCodigo());
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Silent onboarding — creates user + aval in the background
  useEffect(() => {
    let cancelled = false;
    ensureOnboarding(inviteCodigo).then((ok) => {
      if (!cancelled) setOnboardingDone(true);
    });
    return () => { cancelled = true; };
  }, [inviteCodigo]);

  // Handle browser back button
  useEffect(() => {
    const handler = () => setView("catalog");
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (view === "financial") {
    return <FinancialPage onBack={() => setView("catalog")} />;
  }

  if (inviteCodigo) {
    return <InvitePage codigo={inviteCodigo} onRevealFinancial={() => setView("financial")} />;
  }

  return <CatalogPage onRevealFinancial={() => setView("financial")} />;
}
