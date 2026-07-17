import { useMemo, useState } from "react";
import Header from "../../components/Header";
import { recuperarConta, markUnlockedThisSession } from "../../api";
import { encodeRecoveryPhrase } from "../../lib/recoveryPhrase";

interface BackupPageProps {
  identificador: string;
  pin: string;
  onDone: () => void;
}

export default function BackupPage({ identificador, pin, onDone }: BackupPageProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phrase = useMemo(() => encodeRecoveryPhrase(identificador, pin), [identificador, pin]);

  const handleContinue = async () => {
    setError(null);
    setLoading(true);
    const ok = await recuperarConta(identificador, pin);
    setLoading(false);
    if (!ok) {
      setError("Não foi possível confirmar sua conta agora. Tente novamente.");
      return;
    }
    markUnlockedThisSession();
    onDone();
  };

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <h1 className="onboarding__title">Sua chave de segurança</h1>
        <p className="onboarding__tagline">
          Guarde bem — ela é sua garantia de acesso caso esqueça seu PIN ou
          troque de aparelho.
        </p>

        <div className="phrase-box">
          {phrase.map((word, i) => (
            <span className="phrase-box__word" key={i}>
              <span className="phrase-box__index">{i + 1}.</span>
              {word}
            </span>
          ))}
        </div>

        <div style={{ height: "1rem" }} />

        <div className="phrase-warning">
          ⚠️ Anote em papel ou salve num lugar seguro. Sem ela, ninguém — nem
          nós — consegue recuperar sua conta se você esquecer o PIN.
        </div>

        <div style={{ height: "1.25rem" }} />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>Já guardei minha chave em local seguro.</span>
        </label>

        {error && <p className="field__error">{error}</p>}

        <div style={{ height: "0.75rem" }} />

        <button
          className="btn btn--primary"
          onClick={handleContinue}
          disabled={!confirmed || loading}
        >
          {loading ? "Confirmando..." : "Confirmar e continuar"}
        </button>
      </main>
    </div>
  );
}
