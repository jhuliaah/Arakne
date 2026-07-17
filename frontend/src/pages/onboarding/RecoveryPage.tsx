import { useState } from "react";
import Header from "../../components/Header";
import { recuperarConta, markUnlockedThisSession } from "../../api";
import { decodeRecoveryPhrase, parsePhraseInput } from "../../lib/recoveryPhrase";

interface RecoveryPageProps {
  onBack: () => void;
  onRecovered: () => void;
}

export default function RecoveryPage({ onBack, onRecovered }: RecoveryPageProps) {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const words = parsePhraseInput(raw);
    const decoded = decodeRecoveryPhrase(words);
    if (!decoded) {
      setError("Não reconhecemos essa chave. Confira se todas as 18 palavras estão corretas, na ordem certa.");
      return;
    }

    setLoading(true);
    const ok = await recuperarConta(decoded.identificador, decoded.pin);
    setLoading(false);

    if (!ok) {
      setError("Essa chave não corresponde a nenhuma conta. Revise as palavras e tente de novo.");
      return;
    }

    markUnlockedThisSession();
    onRecovered();
  };

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <button className="onboarding__back" onClick={onBack}>← Voltar</button>
        <h1 className="onboarding__title">Recuperar acesso</h1>
        <p className="onboarding__tagline">
          Digite ou cole sua chave de segurança — as 18 palavras que você
          guardou ao criar sua conta.
        </p>

        <form className="onboarding__form" onSubmit={handleSubmit}>
          <textarea
            className="phrase-textarea"
            placeholder="novelo agulha lã ponto trama fio…"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            autoFocus
          />
          <p className="field__hint">As palavras podem estar separadas por espaço, vírgula ou quebra de linha.</p>

          {error && <p className="field__error">{error}</p>}

          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Verificando..." : "Recuperar acesso"}
          </button>
        </form>
      </main>
    </div>
  );
}
