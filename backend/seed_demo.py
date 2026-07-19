#!/usr/bin/env python3
"""Arakne — Script de seed para a demo do júri.

Reseta o banco SQLite e cria:
- A Usuária A pronta para o roteiro (tier 1, 1 aval, saldo zerado, wallet mock)
- As 9 trilhas de aprendizagem (8 técnicas + 1 Ponto Arakne placeholder),
  cada uma com 3 níveis × 2 aulas × 2-3 materiais.

Uso:
    cd backend
    python seed_demo.py

A Usuária B NÃO é criada aqui — ela será criada ao vivo na demo,
pelo link de indicação da Usuária A.
"""

import os
import sys

# Ensure we can import from app/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Aula,
    Aval,
    AvalistaRecuperacao,
    Emprestimo,
    Material,
    Padrao,
    ProgressoPadrao,
    Sessao,
    Trilha,
    Usuaria,
)
from app.auth import hash_pin  # noqa: E402
import secrets as _secrets  # noqa: E402


# Placeholder npub for Usuária A — the backend does NOT generate real Nostr
# keys (that is the frontend's responsibility). This 64-char hex placeholder
# matches the size of a real Nostr pubkey (32 bytes) so the recovery-discovery
# endpoints can be exercised end-to-end in the demo. The standalone frontend
# will replace this with a real npub when it owns the nsec.
_DEMO_NPUB_USUARIA_A = (
    "a" * 64  # 64-char hex placeholder — clearly not a real pubkey
)


def reset_database():
    """Drop all tables and recreate them fresh."""
    print("[seed] Resetando banco de dados...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("[seed] ✓ Tabelas recriadas.")


def seed_usuaria_a():
    """Create Usuária A — tier 1, 1 aval received, zero balance.

    We need two users to create an Aval:
    - A "seed avalista" (tier 3, shadow user) that gives the aval to A
    - Usuária A herself (tier 1 after receiving the aval)

    The seed avalista is a throwaway account that exists only so the
    motor de risco can validate A's eligibility.
    """
    db = SessionLocal()
    try:
        # ── Shadow avalista (gives aval to A) ───────────────────
        shadow = Usuaria(
            identificador="shadow_avalista_seed",
            pin_hash=hash_pin("0000"),
            lnbits_wallet_key="mock_shadow_key",
            codigo_indicacao="shadow_seed_code",
            tier=3,  # tier 3 so pode_avalizar would pass
            saldo_devedor=0,
            tier_congelado=False,
            padroes_completos=0,
        )
        db.add(shadow)
        db.flush()

        # ── Usuária A — the demo user ──────────────────────────
        usuaria_a = Usuaria(
            identificador="demo_usuaria_a",
            pin_hash=hash_pin("1234"),
            lnbits_wallet_key="mock_wallet_a",
            codigo_indicacao="DEMO_A_INVITE",
            codigo_indicacao_usado=None,
            tier=1,  # already tier 1 (received aval)
            saldo_devedor=0,
            tier_congelado=False,
            padroes_completos=0,
            npub=_DEMO_NPUB_USUARIA_A,  # placeholder npub (see note above)
        )
        db.add(usuaria_a)
        db.flush()

        # ── Aval: shadow → A ───────────────────────────────────
        aval = Aval(
            usuaria_que_avaliza_id=shadow.id,
            nova_usuaria_id=usuaria_a.id,
        )
        db.add(aval)

        # ── Avalistas de recuperação (auto-shadow, T=2 N=3) ────
        # Slot 1: shadow (the seed avalista has no npub). Slots 2 and 3:
        # shadows with placeholder npubs. The frontend will replace these
        # with real npubs when it owns the nsec for each shadow wallet.
        for ordem in (1, 2, 3):
            db.add(
                AvalistaRecuperacao(
                    usuaria_id=usuaria_a.id,
                    npub_avaliadora=_secrets.token_hex(32),
                    ordem=ordem,
                    is_shadow=True,
                )
            )

        db.commit()

        print(f"[seed] ✓ Usuária A criada:")
        print(f"         identificador:  {usuaria_a.identificador}")
        print(f"         PIN:            1234")
        print(f"         tier:           {usuaria_a.tier}")
        print(f"         saldo_devedor:  {usuaria_a.saldo_devedor}")
        print(f"         congelado:      {usuaria_a.tier_congelado}")
        print(f"         npub:           {usuaria_a.npub} (placeholder)")
        print(f"         convite (B):    /convite/{usuaria_a.codigo_indicacao}")
        print(f"")
        print(f"[seed] ✓ Shadow avalista criada (tier 3, descartável)")
        print(f"")
        print(f"[seed] Banco pronto para a demo!")
        print(f"")
        print(f"  Roteiro do júri:")
        print(f"  1. Abrir http://localhost:5173/convite/DEMO_A_INVITE")
        print(f"     → Usuária B é criada + aval automático → tier 1")
        print(f"  2. Digitar 'Ponto Arakne' na busca → tela 'Meus Materiais'")
        print(f"  3. Clicar 'Solicitar Kit de Material' → empréstimo de 5.000")
        print(f"  4. Clicar 'Concluir Padrão' → pagar 2.000 (parcial)")
        print(f"  5. Clicar 'Concluir Padrão' → pagar 3.000 (restante)")
        print(f"  6. Tier sobe de 1 → 2 em tempo real")
    finally:
        db.close()


# ── Dados das 9 trilhas de aprendizagem ─────────────────────
# 8 técnicas + 1 Ponto Arakne placeholder. Cada trilha tem 3 níveis ×
# 2 aulas × 2-3 materiais. Conteúdo educacional, sem acoplamento financeiro.

TRILHAS_DEMO = [
    {
        "titulo": "Crochê Básico",
        "tecnica": "Crochê",
        "estilo": "Básico",
        "descricao": "Seus primeiros pontos de crochê, do nó deslizante ao ponto alto. Um caminho acolhedor para quem nunca pegou em agulha.",
        "emoji": "🧶",
        "cor": "#F5C7C7",
        "ordem": 1,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Nó deslizante e correntinha",
                        "descricao": "Aprendemos a segurar agulha e fio e a fazer o nó deslizante, ponto de partida de qualquer peça. Em seguida dominamos a correntinha (corr), a fundação sobre a qual todos os outros pontos se apoiam. Pratique a tensão até as correntinhas ficarem uniformes.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-basico-1-1-1.pdf", "titulo": "Guia: materiais e postura", "legenda": "Como escolher agulha nº 4-5, fio de algodão claro e segurar a mão."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/croche-basico-1-1-2.mp4", "titulo": "Nó deslizante e correntinha", "legenda": "Passo a passo do nó inicial e da corrente de base."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/croche-basico-1-1-3.png", "titulo": "Diagrama da correntinha", "legenda": "Esquema visual do movimento da laçada."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto baixíssimo e ponto baixo",
                        "descricao": "Conhecemos o ponto baixíssimo (pbx), usado para unir carreiras e deslocar sem volume, e o ponto baixo (pb), o ponto mais denso e versátil do crochê brasileiro. Com pb e corr você já consegue fazer porta-copos e cestos simples.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-basico-1-2-1.mp4", "titulo": "Ponto baixíssimo e ponto baixo", "legenda": "Demonstração dos dois pontos com fechamento de carreira."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-basico-1-2-2.pdf", "titulo": "Receita: porta-copos em pb", "legenda": "Primeiro projeto prático usando corr e pb em círculo."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Meio ponto alto e ponto alto",
                        "descricao": "Introduzimos o meio ponto alto (mpa), equilíbrio entre densidade e altura, e o ponto alto (pa), o mais versátil para blusas, xales e cobertores. Aprendemos a virar a carreira com correntinha de altura e a contar laçadas.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-basico-2-1-1.mp4", "titulo": "Meio ponto alto e ponto alto", "legenda": "Comparação visual entre mpa e pa."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-basico-2-1-2.pdf", "titulo": "Tabela de alturas dos pontos", "legenda": "Comparativo de altura, densidade e uso de cada ponto básico."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/croche-basico-2-1-3.png", "titulo": "Símbolos em gráfico de receita", "legenda": "Como ler símbolos de corr, pb, mpa e pa."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Crochê circular e arremate",
                        "descricao": "Aprendemos a trabalhar em círculo usando pbx para fechar voltas, base para amigurumis e tapetes. Por fim, o arremate correto: cortar o fio, passar pelo último laço e esconder as pontas com agulha de tapeceiro.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-basico-2-2-1.mp4", "titulo": "Crochê circular passo a passo", "legenda": "Início em anel mágico e fechamento com pbx."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-basico-2-2-2.pdf", "titulo": "Arremate e esconder pontas", "legenda": "Técnica de acabamento invisível com agulha de lã."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto altíssimo e ponto caranguejo",
                        "descricao": "Conhecemos o ponto altíssimo (pta, treble crochet) com duas laçadas, ideal para rendas e pontos vazados. Em seguida o ponto caranguejo (crab stitch), que se faz de trás para frente e cria borda decorativa resistente.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-basico-3-1-1.mp4", "titulo": "Ponto altíssimo e ponto caranguejo", "legenda": "Demonstração dos dois pontos com dicas de tensão."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-basico-3-1-2.pdf", "titulo": "Receita: borda de caranguejo em toalha", "legenda": "Aplicação prática do ponto caranguejo como acabamento."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Lendo receitas e ajustando tensão",
                        "descricao": "Aprendemos a ler receitas em texto e gráfico, com abreviações padrão (corr, pb, pa, mpa, pbx, pta) e marcações de repetição. Por fim, como fazer amostra (swatch) e ajustar a tensão trocando o número da agulha.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-basico-3-2-1.pdf", "titulo": "Glossário de abreviações", "legenda": "Tabela completa de abreviações pt-BR e equivalentes em inglês."},
                            {"ordem": 2, "tipo": "imagem", "url": "https://arakne.app/materiais/croche-basico-3-2-2.png", "titulo": "Como medir amostra 10×10 cm", "legenda": "Medindo tensão com régua e ajustando agulha."},
                            {"ordem": 3, "tipo": "video", "url": "https://arakne.app/materiais/croche-basico-3-2-3.mp4", "titulo": "Lendo gráfico de receita", "legenda": "Interpretando símbolos e repetições em gráfico."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Crochê Avançado",
        "tecnica": "Crochê",
        "estilo": "Amigurumi & Granny",
        "descricao": "Pontos fantasia e peças tridimensionais: amigurumi, granny square, ponto leque e ponto pipoca. Para quem já domina o ponto baixo e quer ir além.",
        "emoji": "🧸",
        "cor": "#F8D7B5",
        "ordem": 2,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Granny square básico",
                        "descricao": "Montamos o primeiro granny square em crochê circular, alternando pa e corr para criar os cantos. Aprendemos a trocar de cor no fim da volta e a unir vários squares com ponto baixíssimo.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-avancado-1-1-1.mp4", "titulo": "Granny square passo a passo", "legenda": "Montagem do square em quatro voltas com troca de cor."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-avancado-1-1-2.pdf", "titulo": "Receita: granny square de 12 cm", "legenda": "Receita escrita com contagem de pontos por volta."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/croche-avancado-1-1-3.png", "titulo": "Esquema de união de squares", "legenda": "Como unir squares com pbx ou costura."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Aumentos e diminuições em crochê",
                        "descricao": "Aprendemos a aumentar (aum) e diminuir (dim) pontos em crochê, base para modelagem de amigurumi e peças vestíveis. Praticamos o aumento invisível e a diminuição fechada para manter o acabamento limpo.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-avancado-1-2-1.mp4", "titulo": "Aumento invisível e diminuição", "legenda": "Técnicas para amigurumi sem buracos."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-avancado-1-2-2.pdf", "titulo": "Guia de aum e dim", "legenda": "Quando e como aumentar/diminuir em receitas."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Amigurumi: formas 3D",
                        "descricao": "Construímos uma bola e um ovo em crochê circular, alternando carreiras de aumento e diminuição para criar volume. Aprendemos a modelar cabeça, corpo e membros separadamente e a unir com costura invisível.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-avancado-2-1-1.mp4", "titulo": "Amigurumi esférico", "legenda": "Construção de bola com aumentos regulares."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-avancado-2-1-2.pdf", "titulo": "Receita: amigurumi ovo", "legenda": "Receita completa com enchimento e acabamento."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/croche-avancado-2-1-3.png", "titulo": "Esquema de modelagem 3D", "legenda": "Diagrama de aumentos e diminuições por carreira."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto leque e ponto pipoca",
                        "descricao": "Conhecemos o ponto leque (fan stitch), que agrupa vários pontos altos na mesma base criando um efeito de renda aberta. Em seguida o ponto pipoca (popcorn), feito com vários pa fechados juntos no mesmo ponto, criando relevo texturizado.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-avancado-2-2-1.mp4", "titulo": "Ponto leque e ponto pipoca", "legenda": "Demonstração dos dois pontos fantasia."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-avancado-2-2-2.pdf", "titulo": "Receita: pano de praia em leque", "legenda": "Aplicação do ponto leque em peça plana."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Amigurumi articulado e detalhes",
                        "descricao": "Aprendemos a fazer amigurumi com membros articulados usando articulação de pinça (joint) e linha de costura segura. Detalhes como olhos de segurança, bordado de focinho e cabelo de linha completam a peça.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/croche-avancado-3-1-1.mp4", "titulo": "Articulação de membros", "legenda": "Como prender braços e pernas com pinça."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-avancado-3-1-2.pdf", "titulo": "Segurança em amigurumi infantil", "legenda": "Escolha segura de olhos e enchimento."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Manta de granny squares",
                        "descricao": "Planejamos uma manta unindo dezenas de granny squares, escolhendo paleta de cores e disposição. Aprendemos acabamento final com borda de ponto caranguejo e bloqueio (blocking) da peça.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/croche-avancado-3-2-1.pdf", "titulo": "Planejamento de manta", "legenda": "Cálculo de squares, cores e disposição."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/croche-avancado-3-2-2.mp4", "titulo": "Blocking de manta", "legenda": "Como esticar e fixar a peça final."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/croche-avancado-3-2-3.png", "titulo": "Paletas de granny squares", "legenda": "Exemplos de combinações de cor."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Bordado Ponto Cruz",
        "tecnica": "Bordado",
        "estilo": "Ponto Cruz",
        "descricao": "A técnica contada mais clássica do bordado, com gráfico, avesso perfeito e arremate impecável. Ideal para quem gosta de precisão e padrão.",
        "emoji": "❌",
        "cor": "#F8E1B5",
        "ordem": 3,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Materiais e início do fio",
                        "descricao": "Conhecemos o tecido Aida, a linha mouliné e o bastidor, e aprendemos a retirar a meada corretamente. Mostramos três formas de começar o fio sem nó: laçada em loop, cauda solta e nó temporário.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-cruz-1-1-1.pdf", "titulo": "Guia de materiais para ponto cruz", "legenda": "Aida, mouliné, agulha e bastidor."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/bordado-cruz-1-1-2.mp4", "titulo": "Iniciando o fio sem nó", "legenda": "Três técnicas para começar sem marcar o avesso."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/bordado-cruz-1-1-3.png", "titulo": "Contagem do Aida", "legenda": "Como contar fios e encontrar o centro do tecido."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "O X do ponto cruz e avesso perfeito",
                        "descricao": "Aprendemos a fazer o X sempre no mesmo sentido (baixo-esquerda para cima-direita, depois baixo-direita para cima-esquerta) para o avesso ficar uniforme. Praticamos um retângulo simples e um zigue-zague mantendo o avesso perfeito.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-cruz-1-2-1.mp4", "titulo": "Avesso perfeito passo a passo", "legenda": "Sentido do X e técnica de retângulo."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-cruz-1-2-2.pdf", "titulo": "Exercício: retângulo e zigue-zague", "legenda": "Dois padrões simples para treinar o avesso."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Lendo gráficos e contorno",
                        "descricao": "Aprendemos a ler gráficos de ponto cruz, com símbolos por cor e marcações de centro. Em seguida a técnica do contorno, que delimita áreas antes do preenchimento para garantir alinhamento perfeito.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-cruz-2-1-1.pdf", "titulo": "Como ler gráfico de ponto cruz", "legenda": "Símbolos, cores e marcações de centro."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/bordado-cruz-2-1-2.mp4", "titulo": "Técnica do contorno", "legenda": "Delimitando áreas antes do preenchimento."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/bordado-cruz-2-1-3.png", "titulo": "Gráfico de coração", "legenda": "Padrão simples para praticar contorno e preenchimento."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Arremate e técnica do pingado",
                        "descricao": "Aprendemos a arrematar o fio passando por baixo de 4-5 X no avesso, sem deixar tensão. Em seguida a técnica do pingado, usada para pontos isolados e detalhes pequenos sem precisar reiniciar o fio.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-cruz-2-2-1.mp4", "titulo": "Arremate e pingado", "legenda": "Como terminar e fazer pontos isolados."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-cruz-2-2-2.pdf", "titulo": "Exercício: flor em ponto cruz", "legenda": "Padrão que usa contorno, preenchimento e pingado."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto francês e ponto vai e vem",
                        "descricao": "Introduzimos o ponto francês (nó francês) como detalhe decorativo em miolos de flor e olhos, e o ponto vai e vem (backstitch) para contornos finos sobre o ponto cruz. Combinamos as técnicas em uma estrela completa.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-cruz-3-1-1.mp4", "titulo": "Nó francês e vai e vem", "legenda": "Dois pontos de detalhe sobre ponto cruz."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-cruz-3-1-2.pdf", "titulo": "Receita: estrela completa", "legenda": "Padrão que combina todas as técnicas aprendidas."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Lavagem, secagem e emolduramento",
                        "descricao": "Aprendemos a lavar a peça bordada à mão com sabão neutro, secar na horizontal e passar pelo avesso. Por fim, emolduramos o bastidor com acabamento de costura para virar peça decorativa.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-cruz-3-2-1.pdf", "titulo": "Cuidados pós-bordado", "legenda": "Lavagem, secagem e passagem corretas."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/bordado-cruz-3-2-2.mp4", "titulo": "Emoldurando no bastidor", "legenda": "Acabamento para virar peça de parede."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/bordado-cruz-3-2-3.png", "titulo": "Antes e depois do blocking", "legenda": "Como o blocking alinha os pontos."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Bordado Livre",
        "tecnica": "Bordado",
        "estilo": "Livre",
        "descricao": "Bordado sem gráfico rígido, com pontos que valorizam a liberdade criativa. Para quem prefere desenhar com a agulha em tecido de algodão cru.",
        "emoji": "🌸",
        "cor": "#D9E8C5",
        "ordem": 4,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto corrente e ponto atrás",
                        "descricao": "Aprendemos o ponto corrente (chain stitch), que forma uma sequência de elos ideal para contornos e letras. Em seguida o ponto atrás (backstitch), firme e discreto, base para contornos definidos.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-livre-1-1-1.mp4", "titulo": "Ponto corrente e ponto atrás", "legenda": "Dois pontos de contorno essenciais."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-livre-1-1-2.pdf", "titulo": "Guia: tecidos para bordado livre", "legenda": "Algodão cru e linho, escolha do bastidor."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/bordado-livre-1-1-3.png", "titulo": "Diagrama do ponto corrente", "legenda": "Formação dos elos passo a passo."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto haste e ponto cheio",
                        "descricao": "Conhecemos o ponto haste (stem stitch), que cria linha torcida perfeita para caules e curvas. Em seguida o ponto cheio (satin stitch), que preenche áreas pequenas com linhas paralelas bem juntas.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-livre-1-2-1.mp4", "titulo": "Ponto haste e ponto cheio", "legenda": "Contorno e preenchimento básicos."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-livre-1-2-2.pdf", "titulo": "Exercício: folha em haste e cheio", "legenda": "Pequena composição para praticar os dois pontos."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto margarida e nó francês",
                        "descricao": "Aprendemos o ponto margarida (lazy daisy), que forma pétalas alongadas presas por um pequeno ponto reto. Em seguida o nó francês (french knot), que adiciona textura e volume em miolos de flor e detalhes.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-livre-2-1-1.mp4", "titulo": "Ponto margarida e nó francês", "legenda": "Flores e detalhes em relevo."},
                            {"ordem": 2, "tipo": "imagem", "url": "https://arakne.app/materiais/bordado-livre-2-1-2.png", "titulo": "Esquema do nó francês", "legenda": "Como enrolar a linha na agulha."},
                            {"ordem": 3, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-livre-2-1-3.pdf", "titulo": "Receita: ramo de margaridas", "legenda": "Composição que combina haste, margarida e nó francês."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto pirulito e ponto folha",
                        "descricao": "Conhecemos o ponto pirulito, que cria pequenas bolinhas decorativas, e o ponto folha, ideal para bordar folhas com aparência cheia e interativa. Combinamos os pontos em uma pequena composição botânica.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-livre-2-2-1.mp4", "titulo": "Ponto pirulito e ponto folha", "legenda": "Detalhes decorativos e preenchimento de folhas."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-livre-2-2-2.pdf", "titulo": "Composição botânica", "legenda": "Pequeno arranjo combinando todos os pontos."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto rococó e ponto matiz",
                        "descricao": "Introduzimos o ponto rococó, que cria flores em relevo enrolando a linha várias vezes na agulha, e o ponto matiz, usado para criar sombras e degradês com tons de linha sobrepostos.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-livre-3-1-1.mp4", "titulo": "Ponto rococó e matiz", "legenda": "Relevo e sombreado avançados."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-livre-3-1-2.pdf", "titulo": "Paleta para matiz", "legenda": "Como escolher tons para degradê em bordado."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Composição livre e transferência",
                        "descricao": "Aprendemos a transferir um desenho para o tecido usando papel carbono de bordado, caneta solúvel e método de luz. Por fim, criamos uma composição livre combinando todos os pontos aprendidos em um bastidor final.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/bordado-livre-3-2-1.mp4", "titulo": "Transferindo desenho para o tecido", "legenda": "Três métodos de transferência."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/bordado-livre-3-2-2.pdf", "titulo": "Projeto final: bastidor botânico", "legenda": "Composição livre com todos os pontos da trilha."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/bordado-livre-3-2-3.png", "titulo": "Galeria de composições", "legenda": "Exemplos para inspirar o projeto final."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Tricô Básico",
        "tecnica": "Tricô",
        "estilo": "Básico",
        "descricao": "Do primeiro ponto meia ao primeiro cachecol. A base de tudo no tricô, com dois movimentos que abrem mil possibilidades.",
        "emoji": "🧣",
        "cor": "#C5D9E8",
        "ordem": 5,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Montagem e ponto meia",
                        "descricao": "Aprendemos a montar os pontos na agulha (cast on) com o método de laçada simples. Em seguida o ponto meia (m / knit), o primeiro movimento fundamental do tricô, com o fio atrás da agulha.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/trico-basico-1-1-1.mp4", "titulo": "Montagem e ponto meia", "legenda": "Primeiros pontos na agulha."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/trico-basico-1-1-2.pdf", "titulo": "Guia: agulhas e fios para iniciantes", "legenda": "Escolha de agulha nº 5 e fio médio."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/trico-basico-1-1-3.png", "titulo": "Posição do fio: meia vs tricô", "legenda": "Diferença visual entre os dois pontos básicos."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto tricô e ponto cordão",
                        "descricao": "Conhecemos o ponto tricô (t / purl), com o fio à frente da agulha, irmão do ponto meia. Combinamos os dois no ponto cordão (garter stitch), o mais fácil de todos, onde todas as carreiras são iguais e o tecido não enrola.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/trico-basico-1-2-1.mp4", "titulo": "Ponto tricô e cordão", "legenda": "Segundo movimento fundamental e primeiro ponto completo."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/trico-basico-1-2-2.pdf", "titulo": "Receita: cachecol em cordão", "legenda": "Primeiro projeto prático, sem preocupação com direito/avesso."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto jersey e barra 1/1",
                        "descricao": "Aprendemos o ponto jersey (meia de um lado, tricô do outro), que cria tecido liso mas enrola nas bordas. Em seguida a barra 1/1 (rib), alternando 1 meia e 1 tricô, que cria elasticidade e não enrola.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/trico-basico-2-1-1.mp4", "titulo": "Jersey e barra 1/1", "legenda": "Combinações de meia e tricô."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/trico-basico-2-1-2.pdf", "titulo": "Por que o jersey enrola", "legenda": "Entendendo tensão e curvatura do tecido."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/trico-basico-2-1-3.png", "titulo": "Comparativo de pontos", "legenda": "Cordão, jersey e barra lado a lado."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Laçada e aumento",
                        "descricao": "Aprendemos a laçada (yo), o aumento mais simples, que cria furinho decorativo e é base de pontos rendados. Em seguida o aumento intercalado e o aumento no mesmo ponto, que adicionam pontos sem deixar furo.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/trico-basico-2-2-1.mp4", "titulo": "Laçada e aumentos", "legenda": "Três técnicas de aumento e quando usar cada uma."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/trico-basico-2-2-2.pdf", "titulo": "Receita: gorro com laçadas", "legenda": "Gorro simples com ponto rendado básico."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Diminuições: 2pjm e mate simples",
                        "descricao": "Aprendemos o 2 pontos juntos em meia (2pjm), diminuição à direita, e o mate simples, diminuição à esquerda. Combinados em lados opostos, criam decotes e cavas simétricas e elegantes.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/trico-basico-3-1-1.mp4", "titulo": "2pjm e mate simples", "legenda": "Diminuições à direita e à esquerda."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/trico-basico-3-1-2.pdf", "titulo": "Simetria em decotes e cavas", "legenda": "Quando usar cada diminuição para acabamento limpo."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Arremate e montagem de peça",
                        "descricao": "Aprendemos o arremate (bind off) padrão para finalizar a peça sem apertar, e a montagem de costuras laterais com ponto mattress invisível. Por fim, o blocking úmido para uniformizar tensão e abrir pontos rendados.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/trico-basico-3-2-1.mp4", "titulo": "Arremate e costura mattress", "legenda": "Finalização e montagem invisível."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/trico-basico-3-2-2.pdf", "titulo": "Blocking úmido passo a passo", "legenda": "Como esticar e fixar a peça final."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/trico-basico-3-2-3.png", "titulo": "Antes e depois do blocking", "legenda": "Diferença visual do blocking em jersey e rendado."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Costura à Mão",
        "tecnica": "Costura",
        "estilo": "Mão",
        "descricao": "Pontos manuais essenciais para reparos, acabamentos e pequenos projetos. A base de toda costura, da agulha ao nó final.",
        "emoji": "🪡",
        "cor": "#E1C5E8",
        "ordem": 6,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Kit, postura e ponto alinhavo",
                        "descricao": "Montamos o kit básico de costura à mão (agulhas, linhas, dedal, alfinetes, tesoura) e aprendemos a postura correta. Em seguida o ponto alinhavo, ponto temporário para unir tecidos antes da costura definitiva.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-mao-1-1-1.pdf", "titulo": "Kit de costura à mão", "legenda": "Lista completa de materiais para iniciantes."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/costura-mao-1-1-2.mp4", "titulo": "Postura e ponto alinhavo", "legenda": "Como sentar e dar os primeiros pontos."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-mao-1-1-3.png", "titulo": "Espessura de agulha por tecido", "legenda": "Tabela de agulhas por tipo de tecido."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto corrido e ponto atrás",
                        "descricao": "Aprendemos o ponto corrido, básico para unir camadas e fazer bainhas, e o ponto atrás, mais firme e discreto, semelhante ao ponto reto da máquina. Praticamos em retalhos de algodão.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-mao-1-2-1.mp4", "titulo": "Ponto corrido e ponto atrás", "legenda": "Dois pontos básicos comparados."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-mao-1-2-2.pdf", "titulo": "Exercício: reparo em rasgo", "legenda": "Aplicação prática do ponto atrás em conserto."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ponto caseado e aplicações",
                        "descricao": "Aprendemos o ponto caseado (buttonhole stitch), usado para arrematar bordas e fazer casas de botão à mão. Praticamos em feltro e aplicações, mantendo o laço de trava sempre no mesmo sentido.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-mao-2-1-1.mp4", "titulo": "Ponto caseado passo a passo", "legenda": "Técnica do laço de trava na borda."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-mao-2-1-2.pdf", "titulo": "Casa de botão à mão", "legenda": "Como abrir e casear uma casa de botão."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-mao-2-1-3.png", "titulo": "Aplicações em feltro", "legenda": "Exemplos de acabamento com caseado."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto invisível e bainha",
                        "descricao": "Aprendemos o ponto invisível, que une duas camadas sem aparecer no direito, ideal para bainhas de saia e calça. Praticamos a bainha à mão com alfinetes, dobra e ponto invisível pelo avesso.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-mao-2-2-1.mp4", "titulo": "Ponto invisível e bainha", "legenda": "Bainha invisível à mão."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-mao-2-2-2.pdf", "titulo": "Receita: bainha de pano de prato", "legenda": "Primeiro projeto prático de bainha."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Pregar botões e ilhoses",
                        "descricao": "Aprendemos a pregar botões com pé (espaço para o tecido) e botões sem pé, e a aplicar ilhoses à mão com caseado reforçado. Detalhes como nó escondido e reforço com linha dupla garantem durabilidade.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-mao-3-1-1.mp4", "titulo": "Botões e ilhoses à mão", "legenda": "Prego de botões com e sem pé."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-mao-3-1-2.pdf", "titulo": "Reforço de ilhoses", "legenda": "Técnica de caseado reforçado para ilhoses."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Reparos invisíveis e remendos",
                        "descricao": "Aprendemos técnicas de reparo invisível em tecidos descosturados e remendos decorativos com ponto caseado e aplicações. Por fim, como escolher linha da mesma cor e esconder nós dentro da costura.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-mao-3-2-1.mp4", "titulo": "Reparo invisível e remendo", "legenda": "Técnicas para conserto discreto e decorativo."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-mao-3-2-2.pdf", "titulo": "Remendo decorativo com aplicações", "legenda": "Projeto final de remendo visível."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-mao-3-2-3.png", "titulo": "Galeria de remendos", "legenda": "Inspirações de reparo decorativo."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Costura à Máquina",
        "tecnica": "Costura",
        "estilo": "Máquina",
        "descricao": "Da primeira costura reta ao zíper e viés. Para quem quer dominar a máquina e fazer peças completas com acabamento profissional.",
        "emoji": "✂️",
        "cor": "#C5E8DC",
        "ordem": 7,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Conhecendo a máquina e ponto reto",
                        "descricao": "Conhecemos as partes da máquina (carretel, bobina, calcador, regulador de tensão) e aprendemos a encher bobina e passar a linha. Em seguida o ponto reto, com margem de costura 1,5 cm e controle de velocidade.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-maquina-1-1-1.pdf", "titulo": "Partes da máquina de costura", "legenda": "Guia ilustrado de cada componente."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/costura-maquina-1-1-2.mp4", "titulo": "Enchendo bobina e passando linha", "legenda": "Setup completo da máquina."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-maquina-1-1-3.png", "titulo": "Margem de costura padrão", "legenda": "Como alinhar tecido com a guia da máquina."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Ponto zigue-zague e casear",
                        "descricao": "Aprendemos o ponto zigue-zague, usado para acabamento de borda e prevenir desfiamento. Em seguida o casear automático da máquina, que cria casas de botão prontas em um único movimento.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-maquina-1-2-1.mp4", "titulo": "Zigue-zague e casear", "legenda": "Dois pontos utilitários essenciais."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-maquina-1-2-2.pdf", "titulo": "Casa de botão à máquina", "legenda": "Passo a passo do casear automático."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Bainhas e bainha invisível",
                        "descricao": "Aprendemos a fazer bainha simples com dobra dupla e ponto reto, e a bainha invisível à máquina usando o calcador de bainha cega. Praticamos em barra de calça e bainha de saia.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-maquina-2-1-1.mp4", "titulo": "Bainha simples e invisível", "legenda": "Dois métodos de bainha à máquina."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-maquina-2-1-2.pdf", "titulo": "Calcador de bainha cega", "legenda": "Como usar o acessório para bainha invisível."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-maquina-2-1-3.png", "titulo": "Dobra dupla de bainha", "legenda": "Esquema da dobra para bainha simples."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Pregar zíper e viés",
                        "descricao": "Aprendemos a pregar zíper com calcador de zíper invisível e a aplicar viés (bias tape) em bordas com ponto reto. Técnicas que transformam peças simples em acabamento profissional.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/costura-maquina-2-2-1.mp4", "titulo": "Zíper invisível e viés", "legenda": "Dois acabamentos profissionais."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-maquina-2-2-2.pdf", "titulo": "Receita: necessaire com zíper", "legenda": "Primeiro projeto com zíper e viés."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Molde simples e corte de tecido",
                        "descricao": "Aprendemos a ler um molde básico, marcar o tecido com alfinetes e giz, e cortar com tesoura microserrada. Inclui noções de encaixe de molde para aproveitar o tecido e respeitar o fio.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-maquina-3-1-1.pdf", "titulo": "Leitura de molde básico", "legenda": "Símbolos e marcações de molde."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/costura-maquina-3-1-2.mp4", "titulo": "Corte com fio reto", "legenda": "Como respeitar o fio do tecido ao cortar."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-maquina-3-1-3.png", "titulo": "Encaixe de molde no tecido", "legenda": "Como otimizar o uso do tecido."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Projeto: saquinho com forro",
                        "descricao": "Costuramos um saquinho completo com forro, viés e cordão de fechamento, aplicando todas as técnicas aprendidas. Projeto final que une ponto reto, zigue-zague, viés e acabamento profissional.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/costura-maquina-3-2-1.pdf", "titulo": "Receita: saquinho com forro", "legenda": "Projeto final completo passo a passo."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/costura-maquina-3-2-2.mp4", "titulo": "Montagem do saquinho", "legenda": "Costura do forro e do cordão."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/costura-maquina-3-2-3.png", "titulo": "Variações do projeto", "legenda": "Tamanhos e acabamentos alternativos."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Patchwork Básico",
        "tecnica": "Patchwork",
        "estilo": "Básico",
        "descricao": "Blocos clássicos do patchwork: Nine Patch, Log Cabin, Half-Square Triangle e Flying Geese. Precisão no corte e na costura ¼ polegada.",
        "emoji": "🧩",
        "cor": "#E8D5C5",
        "ordem": 8,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Ferramentas e margem ¼ polegada",
                        "descricao": "Conhecemos o kit de patchwork (cúter rotativo, base autocicatrizante, régua acrílica) e aprendemos a manter a margem de costura de ¼ polegada (0,75 cm) consistente. A precisão no corte e na costura é a base de tudo.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/patchwork-1-1-1.pdf", "titulo": "Kit de patchwork", "legenda": "Ferramentas e materiais essenciais."},
                            {"ordem": 2, "tipo": "video", "url": "https://arakne.app/materiais/patchwork-1-1-2.mp4", "titulo": "Corte com cúter rotativo", "legenda": "Técnica segura de corte na régua."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/patchwork-1-1-3.png", "titulo": "Margem ¼ polegada", "legenda": "Como alinhar o calcador de patchwork."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Bloco Nine Patch",
                        "descricao": "Montamos o bloco Nine Patch, grade 3×3 de nove quadrados, um dos mais simples do patchwork. Aprendemos a unir filas com costura aninhada (pressing seams) para encaixar perfeitamente.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/patchwork-1-2-1.mp4", "titulo": "Nine Patch passo a passo", "legenda": "Montagem do bloco 3×3 com filas aninhadas."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/patchwork-1-2-2.pdf", "titulo": "Receita: Nine Patch de 12 cm", "legenda": "Corte e montagem do bloco clássico."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Bloco Log Cabin",
                        "descricao": "Construímos o bloco Log Cabin, com tiras de tecido costuradas em espiral ao redor de um quadrado central. Aprendemos a alternar lados claro e escuro para criar o efeito clássico de cabana de troncos.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/patchwork-2-1-1.mp4", "titulo": "Log Cabin em espiral", "legenda": "Construção do bloco com tiras em sentido horário."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/patchwork-2-1-2.pdf", "titulo": "Receita: Log Cabin clássico", "legenda": "Tiras numeradas e disposição claro/escuro."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/patchwork-2-1-3.png", "titulo": "Variações de Log Cabin", "legenda": "Courthouse Steps e outras variantes."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Half-Square Triangles (HST)",
                        "descricao": "Aprendemos a fazer Half-Square Triangles (HST) pelo método dois de cada vez: dois quadrados costurados em diagonal, cortados e abertos. Com HSTs criamos dezenas de padrões visuais com contraste.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/patchwork-2-2-1.mp4", "titulo": "HST dois de cada vez", "legenda": "Método eficiente para iniciantes."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/patchwork-2-2-2.pdf", "titulo": "Pressing seams em HST", "legenda": "Como prensar costuras para o tecido escuro."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Bloco Flying Geese",
                        "descricao": "Construímos o bloco Flying Geese, com um triângulo ganso flanqueado por dois triângulos céu, formando um V que aponta para frente. Aprendemos o método quatro de cada vez para eficiência máxima.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/patchwork-3-1-1.mp4", "titulo": "Flying Geese quatro de cada vez", "legenda": "Método rápido para múltiplos blocos."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/patchwork-3-1-2.pdf", "titulo": "Receita: Flying Geese 3×6 polegadas", "legenda": "Bloco clássico com proporções padrão."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Quilting e acabamento de manta",
                        "descricao": "Aprendemos a montar o sanduíche de manta (top + guata + forro), a acolchar com quilting reto à máquina, e a finalizar com bies (viés) na borda. Projeto final: um mini quilt com todos os blocos aprendidos.",
                        "materiais": [
                            {"ordem": 1, "tipo": "video", "url": "https://arakne.app/materiais/patchwork-3-2-1.mp4", "titulo": "Sanduíche de manta e quilting", "legenda": "Montagem e acolchamento reto."},
                            {"ordem": 2, "tipo": "pdf", "url": "https://arakne.app/materiais/patchwork-3-2-2.pdf", "titulo": "Acabamento com bies", "legenda": "Como aplicar viés na borda da manta."},
                            {"ordem": 3, "tipo": "imagem", "url": "https://arakne.app/materiais/patchwork-3-2-3.png", "titulo": "Mini quilt final", "legenda": "Exemplo de manta com Nine Patch, Log Cabin, HST e Flying Geese."},
                        ],
                    },
                ],
            },
        ],
    },
    {
        "titulo": "Ponto Arakne",
        "tecnica": "Ponto Arakne",
        "estilo": "Especial",
        "descricao": "Trilha especial do app Arakne. Conteúdo em construção — em breve novas aulas exclusivas para a comunidade.",
        "emoji": "🕸️",
        "cor": "#D5D5E8",
        "ordem": 9,
        "niveis": [
            {
                "numero": 1,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Aula 1",
                        "descricao": "Conteúdo a definir. Em breve, nova aula introdutória da trilha Ponto Arakne.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/ponto-arakne-1-1-1.pdf", "titulo": "Material a definir", "legenda": "Conteúdo será adicionado posteriormente."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Aula 2",
                        "descricao": "Conteúdo a definir. Em breve, nova aula introdutória da trilha Ponto Arakne.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/ponto-arakne-1-2-1.pdf", "titulo": "Material a definir", "legenda": "Conteúdo será adicionado posteriormente."},
                        ],
                    },
                ],
            },
            {
                "numero": 2,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Aula 1",
                        "descricao": "Conteúdo a definir. Em breve, nova aula intermediária da trilha Ponto Arakne.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/ponto-arakne-2-1-1.pdf", "titulo": "Material a definir", "legenda": "Conteúdo será adicionado posteriormente."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Aula 2",
                        "descricao": "Conteúdo a definir. Em breve, nova aula intermediária da trilha Ponto Arakne.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/ponto-arakne-2-2-1.pdf", "titulo": "Material a definir", "legenda": "Conteúdo será adicionado posteriormente."},
                        ],
                    },
                ],
            },
            {
                "numero": 3,
                "aulas": [
                    {
                        "ordem": 1,
                        "titulo": "Aula 1",
                        "descricao": "Conteúdo a definir. Em breve, nova aula avançada da trilha Ponto Arakne.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/ponto-arakne-3-1-1.pdf", "titulo": "Material a definir", "legenda": "Conteúdo será adicionado posteriormente."},
                        ],
                    },
                    {
                        "ordem": 2,
                        "titulo": "Aula 2",
                        "descricao": "Conteúdo a definir. Em breve, nova aula avançada da trilha Ponto Arakne.",
                        "materiais": [
                            {"ordem": 1, "tipo": "pdf", "url": "https://arakne.app/materiais/ponto-arakne-3-2-1.pdf", "titulo": "Material a definir", "legenda": "Conteúdo será adicionado posteriormente."},
                        ],
                    },
                ],
            },
        ],
    },
]


def seed_trilhas(db):
    """Popula as 9 trilhas de aprendizagem com seus níveis, aulas e materiais.

    Idempotente: se já existem trilhas, apaga e recria (garante estado limpo
    mesmo se o conteúdo do seed mudar entre execuções).
    """
    # Limpa o conteúdo existente (cascata manual — SQLite não tem ON DELETE
    # CASCADE sem FK com ondelete, e os models não declaram ondelete).
    db.query(Material).delete()
    db.query(Aula).delete()
    db.query(Trilha).delete()
    db.commit()

    total_aulas = 0
    total_materiais = 0

    for t_data in TRILHAS_DEMO:
        trilha = Trilha(
            titulo=t_data["titulo"],
            tecnica=t_data["tecnica"],
            estilo=t_data["estilo"],
            descricao=t_data["descricao"],
            emoji=t_data["emoji"],
            cor=t_data["cor"],
            ordem=t_data["ordem"],
        )
        db.add(trilha)
        db.flush()

        for nivel in t_data["niveis"]:
            nivel_num = nivel["numero"]
            for a_data in nivel["aulas"]:
                aula = Aula(
                    trilha_id=trilha.id,
                    nivel=nivel_num,
                    ordem=a_data["ordem"],
                    titulo=a_data["titulo"],
                    descricao=a_data["descricao"],
                )
                db.add(aula)
                db.flush()
                total_aulas += 1

                for m_data in a_data["materiais"]:
                    material = Material(
                        aula_id=aula.id,
                        tipo=m_data["tipo"],
                        url=m_data["url"],
                        titulo=m_data["titulo"],
                        ordem=m_data["ordem"],
                        legenda=m_data["legenda"],
                    )
                    db.add(material)
                    total_materiais += 1

        db.commit()

    print(f"[seed] ✓ {len(TRILHAS_DEMO)} trilhas criadas")
    print(f"[seed]   {total_aulas} aulas")
    print(f"[seed]   {total_materiais} materiais")


if __name__ == "__main__":
    reset_database()
    seed_usuaria_a()

    db = SessionLocal()
    try:
        seed_trilhas(db)
    finally:
        db.close()
