/** Arakne — Decoy catalog page.

  Looks like a real crochet gallery. Zero financial traces.
  The search on this page does NOT respond to any secret term.
*/

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ArrowLeft, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { decoyPatterns } from "@/lib/arakne-patterns";

export default function DecoyPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filterApplied, setFilterApplied] = useState(false);

  useSeoMeta({ title: "Arakne — Galeria de Padrões" });

  const filtered = filterApplied && query
    ? decoyPatterns.filter((p) =>
        p.nome.toLowerCase().includes(query.toLowerCase()) ||
        p.nivel.toLowerCase().includes(query.toLowerCase())
      )
    : decoyPatterns;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-950 shadow-sm">
        <span className="text-2xl">🧶</span>
        <span className="text-lg font-bold text-amber-800 dark:text-amber-200">Arakne</span>
        <span className="ml-auto text-xs text-muted-foreground">crochê & tecelagem</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-20">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>

        {/* Plain search — no secret gestures */}
        <div className="relative mb-6">
          <Input
            type="text"
            placeholder="Buscar padrão..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFilterApplied(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setFilterApplied(true); } }}
            className="pr-10 h-12 rounded-xl bg-white dark:bg-gray-900 shadow-sm"
            aria-label="Buscar padrão de crochê"
          />
          <Button
            size="icon" variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
            onClick={() => setFilterApplied(true)}
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100 mb-1">Galeria de Padrões</h2>
        <p className="text-sm text-muted-foreground mb-4">Coleção de pontos e técnicas para todos os níveis.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pattern) => (
            <Card key={pattern.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-center h-32" style={{ backgroundColor: pattern.cor }}>
                <span className="text-4xl">{pattern.emoji}</span>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-1">{pattern.nome}</h3>
                <Badge variant="secondary" className="mb-2">{pattern.nivel}</Badge>
                <p className="text-sm text-muted-foreground leading-snug">{pattern.descricao}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhum padrão encontrado.</p>
        )}

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
