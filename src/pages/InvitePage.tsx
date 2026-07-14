/** Arakne — Invite page (/convite/:codigo).

  Shows the catalog with a subtle welcome message.
  Onboarding (user creation + aval) runs in App.tsx via ensureOnboarding.
*/

import { useParams } from "react-router-dom";
import Index from "./Index";

export default function InvitePage() {
  const { codigo } = useParams<{ codigo: string }>();
  return <Index inviteCodigo={codigo ?? null} />;
}
