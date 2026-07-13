/** Search bar — filters patterns and detects the secret search gesture. */

import { useState } from "react";
import { SECRET_SEARCH } from "../data/patterns";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onRevealFinancial: () => void;
}

export default function SearchBar({ onSearch, onRevealFinancial }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().toLowerCase() === SECRET_SEARCH.toLowerCase()) {
      onRevealFinancial();
      return;
    }
    onSearch(query);
  };

  return (
    <form className="search" onSubmit={handleSubmit}>
      <input
        type="text"
        className="search__input"
        placeholder="Buscar padrão..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar padrão de crochê"
      />
      <button type="submit" className="search__btn" aria-label="Buscar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </form>
  );
}
