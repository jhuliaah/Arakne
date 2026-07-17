import Header from "../../components/Header";

interface SplashPageProps {
  onCreateAccount: () => void;
  onHaveAccount: () => void;
}

export default function SplashPage({ onCreateAccount, onHaveAccount }: SplashPageProps) {
  return (
    <div className="page">
      <Header />
      <main className="onboarding onboarding--centered">
        <div className="onboarding__glyph">🧶</div>
        <h1 className="onboarding__title">Arakne</h1>
        <p className="onboarding__tagline">
          padrões de crochê &amp; tricô,<br />feitos por mãos, para mãos.
        </p>
        <div className="onboarding__form">
          <button className="btn btn--primary" onClick={onCreateAccount}>
            Criar conta
          </button>
          <button className="btn btn--secondary" onClick={onHaveAccount}>
            Já tenho conta
          </button>
        </div>
      </main>
    </div>
  );
}
