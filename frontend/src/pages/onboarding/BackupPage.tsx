/** BackupPage — mostra o mnemonic BIP-39 (12 palavras) como backup único.
 *
 *  Substitui a antiga "frase de 18 palavras" (que codificava identificador+PIN).
 *  O mnemonic é gerado no passo anterior (CreateAccountPage) e passado para
 *  cá. Este é o ÚNICO momento em que o mnemonic aparece — não é guardado em
 *  lugar nenhum. Se a usuária perder o desenho e o mnemonic, a conta não
 *  pode ser recuperada (recuperação social via NIP-17 cortada este ciclo).
 */

import { useState } from "react";
import Header from "../../components/Header";
import { markUnlockedThisSession } from "../../api";

interface BackupPageProps {
  mnemonic: string;
  onDone: () => void;
}

export default function BackupPage({ mnemonic, onDone }: BackupPageProps) {
  const [confirmed, setConfirmed] = useState(false);

  const words = mnemonic.trim().split(/\s+/).filter(Boolean);

  const handleContinue = () => {
    markUnlockedThisSession();
    onDone();
  };

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <h1 className="onboarding__title">Sua frase de recuperação</h1>
        <p className="onboarding__tagline">
          Guarde bem — ela é o que te deixa voltar ao ateliê caso esqueça seu
          desenho ou troque de aparelho.
        </p>

        <div className="phrase-box">
          {words.map((word, i) => (
            <span className="phrase-box__word" key={i}>
              <span className="phrase-box__index">{i + 1}.</span>
              {word}
            </span>
          ))}
        </div>

        <div style={{ height: "1rem" }} />

        <div className="phrase-warning">
          ⚠️ Anote em papel ou salve num lugar seguro. Sem ela, ninguém — nem
          nós — consegue recuperar seu ateliê se você esquecer o desenho.
        </div>

        <div style={{ height: "1.25rem" }} />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>Já guardei minha frase em local seguro.</span>
        </label>

        <div style={{ height: "0.75rem" }} />

        <button
          className="btn btn--primary"
          onClick={handleContinue}
          disabled={!confirmed}
        >
          Anotei e guardei
        </button>
      </main>
    </div>
  );
}
