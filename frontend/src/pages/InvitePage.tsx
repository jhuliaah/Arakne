/** Invite page — shows the catalog, silently creates user + aval in background. */

import { useEffect, useState, useRef } from "react";
import CatalogPage from "./CatalogPage";
import {
  createAval,
  createUsuaria,
  generatePin,
  getIdentificador,
  getPin,
  isAvalCreated,
  markAvalCreated,
  setIdentificador,
  setPin,
} from "../api";

interface InvitePageProps {
  codigo: string;
  onRevealFinancial: () => void;
}

export default function InvitePage({ codigo, onRevealFinancial }: InvitePageProps) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    async function processInvite() {
      // Check if already accepted this invite
      if (isAvalCreated(codigo)) {
        setStatus("done");
        return;
      }

      try {
        // Ensure user exists
        let ident = getIdentificador();
        if (!ident) {
          const pin = generatePin();
          const usuaria = await createUsuaria(pin);
          if (!usuaria) {
            setStatus("error");
            return;
          }
          ident = usuaria.identificador;
          setIdentificador(ident);
          setPin(pin);
        }

        // Create the Aval silently
        await createAval(codigo, ident);
        markAvalCreated(codigo);
        setStatus("done");
      } catch {
        setStatus("error");
      }
    }

    processInvite();
  }, [codigo]);

  return <CatalogPage onRevealFinancial={onRevealFinancial} inviteCodigo={codigo} />;
}
