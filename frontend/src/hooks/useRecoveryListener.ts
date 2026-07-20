/** useRecoveryListener — hook React que inicia o listener de recuperação.
 *
 *  Track 4B da Fase 4 do plano de recuperação Nostr do Arakne (Opção E).
 *
 *  Inicia o listener no mount do componente quando a usuária está
 *  destravada (`isUnlocked`) e tem o nsec + padrão em memória. Retorna
 *  a lista de pedidos recebidos (para a UI mostrar notificações —
 *  Track 4D).
 *
 *  Fluxo do effect:
 *  1. Popula o cache em memória chamando `loadSharesIntoCache(pattern)`
 *     — descriptografa as shares guardadas no localStorage com o padrão
 *       da avalista. Sem isso, o listener detecta pedidos mas não
 *       consegue responder (cache vazio).
 *  2. Inicia o listener via `startRecoveryListener(nsec, pattern, ...)`
 *     — processa `type: "shard"` (persiste novas shares recebidas) e
 *       `type: "request"` (responde automaticamente com a share do
 *       cache).
 *  3. Cleanup no unmount ou quando deps mudam.
 *
 *  O listener é limpo no unmount ou quando `isUnlocked`/`avalistaNsec`/
 *  `avalistaPattern` mudam (re-subscribe com a nova chave).
 */

import { useEffect, useState } from "react";
import {
  startRecoveryListener,
  loadSharesIntoCache,
  type IncomingRecoveryRequest,
} from "../lib/recovery-respond";

/**
 * @param isUnlocked - se a sessão está destravada (nsec em memória)
 * @param avalistaNsec - bytes da chave privada da avalista (32 bytes), ou null
 * @param avalistaPattern - padrão hexagonal da avalista, ou null
 * @returns array de pedidos recebidos durante a sessão
 */
export function useRecoveryListener(
  isUnlocked: boolean,
  avalistaNsec: Uint8Array | null,
  avalistaPattern: number[] | null,
): IncomingRecoveryRequest[] {
  const [requests, setRequests] = useState<IncomingRecoveryRequest[]>([]);

  useEffect(() => {
    if (!isUnlocked || !avalistaNsec || !avalistaPattern) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // 1. Popula o cache em memória com as shares descriptografadas
      //    do localStorage. Necessário para o listener responder a
      //    pedidos automaticamente.
      try {
        await loadSharesIntoCache(avalistaPattern);
      } catch (err) {
        console.warn(
          "[useRecoveryListener] loadSharesIntoCache falhou:",
          err,
        );
      }
      if (cancelled) return;

      // 2. Inicia o listener (processa shards e requests).
      cleanup = startRecoveryListener(
        avalistaNsec,
        avalistaPattern,
        (request) => {
          setRequests((prev) => [...prev, request]);
        },
      );
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [isUnlocked, avalistaNsec, avalistaPattern]);

  return requests;
}
