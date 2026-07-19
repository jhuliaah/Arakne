/** CreateAccountPage — onboarding: nome + consentimento + desenho do Ponto Arakne.
 *
 *  Substitui o antigo PIN numérico pela identidade Nostr: a usuária desenha
 *  um padrão hexagonal (Ponto Arakne) que vira a senha de destravamento.
 *  O nsec é criptografado com AES-GCM-256 + PBKDF2 do padrão e guardado
 *  no localStorage. O npub (chave pública bech32) é o identificador de
 *  backup — anotado em QR/papel — mostrado na próxima tela (BackupPage).
 *
 *  A conta do backend ainda é criada com um PIN aleatório interno (nunca
 *  mostrado à usuária) para manter a integração financeira existente.
 *  Este ciclo, npub não vai ao backend (YAGNI).
 */

import { useState } from "react";
import Header from "../../components/Header";
import HexPatternCanvas from "../../components/HexPatternCanvas";
import { criarConta, generatePin, setNickname } from "../../api";
import { createAndStoreIdentity } from "../../lib/pattern-storage";
import type { NostrIdentity } from "../../lib/nostr-keys";

interface CreateAccountPageProps {
  inviteCodigo?: string | null;
  onBack: () => void;
  /** Chamado quando o padrão foi confirmado e a identidade Nostr criada.
   *  Recebe npub (chave pública bech32 — mostrada na próxima tela) e
   *  nsec (chave privada bech32 — passada adiante para distribuir os
   *  shards SSSS aos avalistas). O nsec NÃO é persistido em plaintext;
   *  ele só existe em memória entre esta tela e a RecoverySetupPage. */
  onCreated: (npub: string, nsec: string) => void;
}

export default function CreateAccountPage({ inviteCodigo, onBack, onCreated }: CreateAccountPageProps) {
  const [nome, setNome] = useState("");
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePatternConfirmed(pattern: number[]) {
    setError(null);
    setLoading(true);
    try {
      // 1. Cria identidade Nostr: gera nsec direto (32 bytes), deriva npub,
      //    criptografa nsec com o padrão e guarda no localStorage.
      const identity: NostrIdentity = await createAndStoreIdentity(pattern);

      // 2. Cria conta no backend com PIN aleatório interno (a usuária não vê).
      //    Mantém a integração financeira existente (ensureToken/login).
      const pin = generatePin();
      const usuaria = await criarConta(pin, inviteCodigo);
      if (!usuaria) {
        setError("Não foi possível criar sua conta agora. Tente novamente.");
        setLoading(false);
        return;
      }

      if (nome.trim()) setNickname(nome.trim());
      onCreated(identity.npub, identity.nsec);
    } catch {
      setError("Algo deu errado ao guardar seu desenho. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <button className="onboarding__back" onClick={onBack}>← Voltar</button>
        <h1 className="onboarding__title">Criar conta</h1>
        <p className="onboarding__tagline">Leva menos de um minuto.</p>

        <div className="onboarding__form">
          <div className="field">
            <label className="field__label" htmlFor="nome">Nome ou apelido (opcional)</label>
            <input
              id="nome"
              className="field__input"
              placeholder="Como quer ser chamada?"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="off"
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Concordo com as regras da nossa comunidade de tricô. Não pedimos
              e-mail nem telefone.
            </span>
          </label>

          {error && <p className="field__error">{error}</p>}

          <div className="onboarding__pattern-intro">
            <p className="onboarding__tagline" style={{ marginBottom: "0.5rem" }}>
              Desenhe seu <strong>Ponto Arakne</strong> — ele é a chave do seu
              ateliê. Conecte pelo menos 8 pontos e repita para confirmar.
            </p>
          </div>

          <HexPatternCanvas
            mode="register"
            onPatternConfirmed={handlePatternConfirmed}
            minLength={8}
          />

          {loading && (
            <p className="field__hint" style={{ textAlign: "center", marginTop: "0.75rem" }}>
              Guardando seu desenho...
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
