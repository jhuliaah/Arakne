import { useState } from "react";
import Header from "../../components/Header";
import { login, setToken, markUnlockedThisSession, getNickname } from "../../api";

interface PinLoginPageProps {
  identificador: string;
  onUnlocked: () => void;
  onForgotPin: () => void;
}

export default function PinLoginPage({ identificador, onUnlocked, onForgotPin }: PinLoginPageProps) {
  const [pin, setPinValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nickname = getNickname();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{4}$/.test(pin)) {
      setError("Digite os 4 números do seu PIN.");
      return;
    }

    setLoading(true);
    const resp = await login(identificador, pin);
    setLoading(false);

    if (!resp) {
      setError("PIN incorreto. Tente de novo.");
      setPinValue("");
      return;
    }

    setToken(resp.token);
    markUnlockedThisSession();
    onUnlocked();
  };

  return (
    <div className="page">
      <Header />
      <main className="onboarding onboarding--centered">
        <div className="onboarding__glyph">🧶</div>
        <h1 className="onboarding__title">
          {nickname ? `Olá, ${nickname}` : "Bem-vinda de volta"}
        </h1>
        <p className="onboarding__tagline">Digite seu PIN para continuar.</p>

        <form className="onboarding__form" onSubmit={handleSubmit}>
          <input
            className="field__input field__input--pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
            autoComplete="off"
            autoFocus
          />

          {error && <p className="field__error">{error}</p>}

          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="onboarding__footer-link">
          <button onClick={onForgotPin}>Esqueci meu PIN</button>
        </div>
      </main>
    </div>
  );
}
