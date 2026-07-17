/** Aula page — shows PDF, step-by-step images, and video for a lesson.

  Supports three media types per aula: PDF (download/view link), imagem
  (numbered step-by-step sequence), and video (embedded iframe). The
  "Concluir Aula" button marks progress — purely educational, no
  financial effect.
*/

import { useState } from "react";
import Header from "../components/Header";
import BottomNav, { type NavTarget } from "../components/BottomNav";
import { concluirAula } from "../api";
import type { Aula } from "../types";

interface AulaPageProps {
  aula: Aula;
  onBack: () => void;
  onConcluida: () => void;
  onNavigate: (target: NavTarget) => void;
}

export default function AulaPage({ aula, onBack, onConcluida, onNavigate }: AulaPageProps) {
  const [concluida, setConcluida] = useState(aula.concluida);
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pdfs = aula.materiais.filter((m) => m.tipo === "pdf");
  const imagens = aula.materiais
    .filter((m) => m.tipo === "imagem")
    .sort((a, b) => a.ordem - b.ordem);
  const videos = aula.materiais.filter((m) => m.tipo === "video");

  async function handleConcluir() {
    if (concluida) return;
    setSubmitting(true);
    setErro(null);
    const resp = await concluirAula(aula.id);
    setSubmitting(false);
    if (resp === null) {
      setErro("Não foi possível concluir aula. Verifique sua conexão ou faça login novamente.");
      return;
    }
    setConcluida(true);
    // Small delay so the user sees the confirmation before navigating back.
    setTimeout(() => onConcluida(), 800);
  }

  return (
    <div className="page">
      <Header />
      <main className="catalog">
        <button className="financial__back" onClick={onBack} aria-label="Voltar">
          ← Voltar
        </button>

        <div className="aula__header">
          <h2 className="aula__title">{aula.titulo}</h2>
          <p className="aula__desc">{aula.descricao}</p>
        </div>

        {/* PDF — apostila/material de apoio */}
        {pdfs.length > 0 && (
          <section className="aula__section">
            <h3 className="aula__section-title">📄 Material de apoio</h3>
            <ul className="aula__pdf-list">
              {pdfs.map((m) => (
                <li key={m.id}>
                  <a
                    className="aula__pdf-link"
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="aula__pdf-icon" aria-hidden="true">📄</span>
                    <span className="aula__pdf-name">{m.titulo}</span>
                    <span className="aula__pdf-action">Abrir</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Imagens — passo a passo numerado */}
        {imagens.length > 0 && (
          <section className="aula__section">
            <h3 className="aula__section-title">🖼️ Passo a passo</h3>
            <ol className="aula__steps">
              {imagens.map((m, idx) => (
                <li key={m.id} className="aula__step">
                  <span className="aula__step-number">{idx + 1}</span>
                  <div className="aula__step-content">
                    <img
                      className="aula__step-img"
                      src={m.url}
                      alt={m.legenda || m.titulo}
                      loading="lazy"
                    />
                    <p className="aula__step-caption">{m.legenda || m.titulo}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Vídeo — vídeo-aula */}
        {videos.length > 0 && (
          <section className="aula__section">
            <h3 className="aula__section-title">🎬 Vídeo-aula</h3>
            {videos.map((m) => (
              <div key={m.id} className="aula__video">
                <div className="aula__video-frame">
                  <iframe
                    src={m.url}
                    title={m.titulo}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="aula__video-title">{m.titulo}</p>
              </div>
            ))}
          </section>
        )}

        {/* Erro */}
        {erro && (
          <div className="financial__error">
            <p>{erro}</p>
          </div>
        )}

        {/* Concluir */}
        <button
          className="btn btn--primary aula__concluir"
          onClick={handleConcluir}
          disabled={concluida || submitting}
        >
          {concluida ? "✓ Aula concluída" : submitting ? "Salvando..." : "Concluir aula"}
        </button>
      </main>
      <BottomNav active="catalog" onNavigate={onNavigate} />
    </div>
  );
}
