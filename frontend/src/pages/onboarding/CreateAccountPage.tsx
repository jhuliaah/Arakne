import { useState } from "react";
import Header from "../../components/Header";
import { criarConta, setNickname } from "../../api";

interface CreateAccountPageProps {
  inviteCodigo?: string | null;
  onBack: () => void;
  onCreated: (identificador: string, pin: string) => void;
}

export default function CreateAccountPage({ inviteCodigo, onBack, onCreated }: CreateAccountPageProps) {
  const [nome, setNome] = useState("");
  const [pin, setPinValue] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinDigitsOk = /^\d{4}$/.test(pin);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pinDigitsOk) {
      setError("O PIN precisa ter exatamente 4 números.");
      return;
    }
    if (pin !== confirmPin) {
      setError("Os PINs não coincidem.");
      return;
    }
    if (!consent) {
      setError("Você precisa concordar com as regras da comunidade para continuar.");
      return;
    }

    setLoading(true);
    const usuaria = await criarConta(pin, inviteCodigo);
    setLoading(false);

    if (!usuaria) {
      setError("Não foi possível criar sua conta agora. Tente novamente.");
      return;
    }

    if (nome.trim()) setNickname(nome.trim());
    onCreated(usuaria.identificador, pin);
  };

  return (
    <div className="page">
      <Header />
      <main className="onboarding">
        <button className="onboarding__back" onClick={onBack}>← Voltar</button>
        <h1 className="onboarding__title">Criar conta</h1>
        <p className="onboarding__tagline">Leva menos de um minuto.</p>

        <form className="onboarding__form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="nome">Nome ou apelido</label>
            <input
              id="nome"
              className="field__input"
              placeholder="Como quer ser chamada?"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="pin">Crie um PIN de 4 dígitos</label>
            <input
              id="pin"
              className="field__input field__input--pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="confirmPin">Confirme o PIN</label>
            <input
              id="confirmPin"
              className="field__input field__input--pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="••••"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
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

          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Criando..." : "Continuar"}
          </button>
        </form>
      </main>
    </div>
  );
}
