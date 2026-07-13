/** Invite page — shows the catalog, onboarding runs in the background.

  The onboarding creates the user + aval silently (via ensureOnboarding in App.tsx).
  This page just shows the catalog with a subtle welcome message.
*/

import CatalogPage from "./CatalogPage";

interface InvitePageProps {
  codigo: string;
  onRevealFinancial: () => void;
}

export default function InvitePage({ codigo, onRevealFinancial }: InvitePageProps) {
  return <CatalogPage onRevealFinancial={onRevealFinancial} inviteCodigo={codigo} />;
}
