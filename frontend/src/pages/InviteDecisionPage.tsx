import Header from "../components/Header";

interface InviteDecisionPageProps {
  onAceitar: () => void;
  onRecusar: () => void;
}

export default function InviteDecisionPage({ onAceitar, onRecusar }: InviteDecisionPageProps) {
  return (
    <div className="page">
      <Header />
      <main className="onboarding onboarding--centered">
        <div className="onboarding__glyph">🪢</div>
        <h1 className="onboarding__title">Você foi convidada</h1>
        <p className="onboarding__tagline">
          Uma amiga quer te trazer para o grupo de tricô dela. Aceitar vincula
          sua conta nova a ela — isso libera seu primeiro nível de acesso.
        </p>
        <div className="onboarding__form">
          <button className="btn btn--primary" onClick={onAceitar}>
            Aceitar convite
          </button>
          <button className="btn btn--secondary" onClick={onRecusar}>
            Criar conta sem vínculo
          </button>
        </div>
      </main>
    </div>
  );
}
