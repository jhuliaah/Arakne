/** Arakne — Catalog page (the main screen).

  Shows crochet patterns, a search bar with secret gesture detection,
  and the onboarding happens silently in the background.
*/

import { useState, useEffect } from "react";
import { useSeoMeta } from "@unhead/react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { patterns, SECRET_SEARCH, DECOY_SEARCH } from "@/lib/arakne-patterns";
import { ensureOnboarding } from "@/lib/arakne-api";

interface IndexProps {
  inviteCodigo?: string | null;
}

export default function Index({ inviteCodigo }: IndexProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filterApplied, setFilterApplied] = useState(false);

  useSeoMeta({
    title: "Arakne — crochê & tecelagem",
    description: "Aprenda crochê e tecelagem com padrões para todos os níveis.",
  });

  // Silent onboarding
  useEffect(() => {
    ensureOnboarding(inviteCodigo ?? null);
  }, [inviteCodigo]);

  const filtered = filterApplied && query
    ? patterns.filter((p) =>
        p.nome.toLowerCase().includes(query.toLowerCase()) ||
        p.nivel.toLowerCase().includes(query.toLowerCase())
      )
    : patterns;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();

    if (q === SECRET_SEARCH.toLowerCase()) {
      navigate("/materiais");
      return;
    }
    if (q === DECOY_SEARCH.toLowerCase()) {
      navigate("/galeria");
      return;
    }
    setFilterApplied(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-950 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧶</span>
          <div>
            <span className="text-lg font-bold text-amber-800 dark:text-amber-200">Arakne</span>
            <span className="ml-2 text-xs text-muted-foreground">crochê & tecelagem</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-20">
        {/* Search */}
        <form onSubmit={handleSearch} className="relative mb-6">
          <Input
            type="text"
            placeholder="Buscar padrão..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFilterApplied(false); }}
            className="pr-10 h-12 rounded-xl bg-white dark:bg-gray-900 shadow-sm"
            aria-label="Buscar padrão de crochê"
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </Button>
        </form>

        {/* Welcome message for invitees */}
        {inviteCodigo && (
          <div className="mb-6 rounded-xl bg-amber-100 dark:bg-amber-900/30 px-4 py-3 text-center text-sm text-amber-800 dark:text-amber-200">
            Bem-vinda! Explore os padrões disponíveis.
          </div>
        )}

        {/* Title */}
        <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-4">Padrões de Crochê</h2>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pattern) => (
            <Card key={pattern.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div
                className="flex items-center justify-center h-32"
                style={{ backgroundColor: pattern.cor }}
              >
                <span className="text-4xl" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}>
                  {pattern.emoji}
                </span>
              </div>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">{pattern.nome}</h3>
                </div>
                <Badge variant="secondary" className="mb-2">{pattern.nivel}</Badge>
                <p className="text-sm text-muted-foreground leading-snug">{pattern.descricao}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhum padrão encontrado.</p>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Vibed with{" "}
            <a href="https://shakespeare.diy" target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-700 dark:text-amber-300 hover:underline">
              Shakespeare
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
