/** App header — neutral branding with yarn ball logo. */

export default function Header() {
  return (
    <header className="header">
      <div className="header__logo">
        <img src="/favicon.svg" alt="" className="header__icon" />
        <span className="header__name">Arakne</span>
      </div>
      <span className="header__tagline">crochê & tecelagem</span>
    </header>
  );
}
