# Passos para Preencher as Trilhas com Material de Estudo Real

## Estado atual
- 9 trilhas × 3 níveis × 2 aulas = 54 aulas, ~130 materiais
- `seed_demo.py` popula tudo com URLs fictícias (`https://arakne.app/materiais/...`) que **não existem**
- Textos das aulas são reais e genuínos (termos técnicos verificados) — só os `url` dos materiais apontam para o vazio
- Schema `Material`: `id, aula_id, tipo ("pdf"|"imagem"|"video"), url, titulo, ordem, legenda`
- Frontend `AulaPage.tsx` já renderiza: `pdf` → `<a target="_blank">`, `imagem` → `<img loading="lazy">`, `video` → `<iframe>` (assume URL embeddable)
- **Problema atual**: CSP do `frontend/index.html` não tem `frame-src` → `<iframe>` de YouTube é bloqueado hoje, mesmo com URL real

## Decisões de hospedagem (recomendado)
| Tipo de material | Onde hospedar |
|---|---|
| **PDFs** (apostilas, receitas, glossários) próprios | `frontend/public/materiais/<tecnica>/` (Vite serve em dev, build copia para `dist/`) |
| **Imagens** (diagramas, passo a passo) próprias | `frontend/public/materiais/<tecnica>/` |
| **Imagens-diagrama** de terceiros | Wikimedia Commons (`upload.wikimedia.org`) — licença CC-BY/CC0, atribuição obrigatória |
| **Vídeos** | YouTube `youtube-nocookie.com` embed (sem cookies, alinhado ao modelo de ameaça) |
| **Trilha #9 (Ponto Arakne)** | Sem material externo. Aula 1 nível 1 é o portal (HexPatternCanvas). 5 aulas restantes: "Em breve", sem materiais |

**Não usar**: storage externo (S3/R2) no escopo atual; Blossom no frontend standalone (não tem Nostr Provider); URLs de PDFs de terceiros (instabilidade).

---

## Passo 0 — Decisões preliminares (1 dia)
0.1. Confirmar: usar YouTube embed `youtube-nocookie.com` (sim/não)
0.2. Confirmar: usar Wikimedia Commons para diagramas (sim/não) — atribuição obrigatória
0.3. Confirmar: PDFs serão produzidos pela equipe (sim) ou só linkados (não recomendado)
0.4. Confirmar hospedagem: `frontend/public/materiais/` (recomendado pelo deploy no CI atual)

## Passo 1 — Ajustar a CSP do frontend (30 min)
1.1. Abrir `frontend/index.html`
1.2. Na tag `<meta http-equiv="Content-Security-Policy" ...>`, mudar:
   - `img-src 'self' data: blob:` → `img-src 'self' data: blob: https://upload.wikimedia.org https://i.ytimg.com`
   - Adicionar `media-src 'self';`
   - Adicionar `frame-src https://www.youtube-nocookie.com;`
1.3. Salvar, recarregar, abrir DevTools → Console → confirmar que não há violações de CSP ao carregar uma aula com vídeo

**CSP final**:
```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://upload.wikimedia.org https://i.ytimg.com;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' http://localhost:8000 wss://relay.damus.io wss://nos.lol wss://relay.nostr.band https://fonts.googleapis.com https://fonts.gstatic.com;
media-src 'self';
frame-src https://www.youtube-nocookie.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

> **Nota sobre `connect-src http://localhost:8000`**: funciona em dev. Em produção, se o backend mudar de domínio, a CSP precisa ser atualizada. Vale tornar configurável por ambiente antes do deploy (futuro).

## Passo 2 — Estender o schema `Material` (opcional, 1h)
2.1. `backend/app/models/material.py`: adicionar colunas nullable
   - `licenca = Column(String, nullable=True)` — ex. "CC-BY-SA 4.0", "CC0", "YouTube embed", "Proprietário Arakne"
   - `fonte = Column(String, nullable=True)` — autor/canal original
   - `duracao_seg = Column(Integer, nullable=True)` — para vídeos
   - `thumbnail_url = Column(String, nullable=True)` — para vídeos
2.2. `backend/app/schemas/trilha.py`: adicionar mesmos campos como `Optional[str] = None` / `Optional[int] = None` em `MaterialOut`
2.3. `frontend/src/types.ts`: adicionar campos ao tipo `Material`
2.4. Como não há Alembic: **deletar `backend/arakne.db`** e rodar `python seed_demo.py`

## Passo 3 — Criar a pasta de materiais próprios
3.1. Criar `frontend/public/materiais/` com subpastas:
   `croche/`, `bordado-cruz/`, `bordado-livre/`, `trico/`, `costura-mao/`, `costura-maquina/`, `patchwork/`, `arakne/`
3.2. Adicionar `.gitkeep` em cada subpasta

## Passo 4 — Curar vídeos do YouTube por aula (1-2 dias)
4.1. Para cada uma das 48 aulas (exceto as 6 da trilha #9 Ponto Arakne), buscar no YouTube pt-BR um vídeo que cubra o tema da aula. Termos de busca já estão no `titulo` e `descricao` do seed.
4.2. Para cada vídeo encontrado:
   - Confirmar que é pt-BR
   - Copiar o ID do vídeo (11 chars após `v=` ou `/embed/`)
   - Construir URL de embed: `https://www.youtube-nocookie.com/embed/VIDEO_ID`
   - Anotar: título, canal (para `fonte`), duração em segundos (para `duracao_seg`)
   - Thumbnail: `https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg` (para `thumbnail_url`) — **não usar `img.youtube-nocookie.com` (esse domínio não serve thumbnails)**
4.3. **Canais pt-BR recomendados**:
   - **Círculo** (fabricante de fios, videoaulas pt-BR)
   - **Ana Cosentino Patchwork e Quilting** (patchwork, 400k+ views/aula)
   - **Tia Lili** (patchwork, costura, crochê)
   - **Patrícia Müller** (patchwork descomplicado)
   - **JNY Crochê** (curso básico gratuito)
   - **Eu Amo Tricô** (tricô)
   - **DMC Brasil** (bordado)
   - **Pingouin** (tricô, costura)
4.4. **Trilha #9 (Ponto Arakne)**: não atribuir vídeo externo. Deixar as 5 aulas não-portal com `materiais: []` e descrição "Em breve, nova aula exclusiva da comunidade Arakne." A aula 1 nível 1 é o portal, não tem material.

## Passo 5 — Curar imagens-diagrama do Wikimedia Commons (1 dia)
5.1. Para cada aula que tem `tipo: "imagem"` no seed, buscar em:
   - `commons.wikimedia.org/wiki/Category:Crochet`
   - `commons.wikimedia.org/wiki/Category:Knitting`
   - `commons.wikimedia.org/wiki/Category:Embroidery_stitches`
   - `commons.wikimedia.org/wiki/Category:Cross-stitching`
   - `commons.wikimedia.org/wiki/Category:Patchwork_blocks`
   - `commons.wikimedia.org/wiki/Category:Hand_sewing_stitches`
   - `commons.wikimedia.org/wiki/Category:Sewing_machines`
5.2. Para cada imagem:
   - Confirmar licença (CC-BY, CC-BY-SA, CC0 — todos OK; "todos os direitos reservados" → **não usar**)
   - Copiar URL original (`https://upload.wikimedia.org/wikipedia/commons/X/XX/Filename.png`)
   - Anotar autor e licença para os campos `fonte` e `licenca`
5.3. **Imagens já confirmadas** (ponto de partida):
   - **Crochê**: `File:Point_Scale_Crochet.png` (CC-BY-SA 4.0, Glaucia Rodrigues)
   - **Tricô**: `File:Knitting_knit_and_purl_stitches.png` (CC-BY 3.0, WillowW); `File:Knit-schematic.png` (CC-BY-SA 3.0)
   - **Bordado**: `File:Embroidery_Stitches_1.png` (CC0); `File:Cross-stitch_diamond_pattern_(1904).jpg` (domínio público)

## Passo 6 — Produzir PDFs próprios (2-3 dias, paralelizável)
6.1. Para cada aula que tem `tipo: "pdf"` no seed, produzir um PDF curto (2-4 páginas) em pt-BR. Templates:
   - **Guia de materiais**: lista de ferramentas com foto e descrição (1 pág)
   - **Receita**: passo a passo numerado com diagramas (2-3 pág)
   - **Glossário**: tabela de abreviações (1 pág)
   - **Exercício**: padrão simples com gráfico (1-2 pág)
6.2. Fonte de texto (referência, **reescrever** para evitar plágio):
   - **Crochê**: `katiaribeiro.com.br`, `jnycroche.com.br/curso-basico-gratuito/`
   - **Bordado**: `oblogdadmc.com`, `pt.wikihow.com/Bordar-em-Ponto-Cruz`, `domestika.org/pt/blog/8084-tutorial-bordado`
   - **Tricô**: `blog.pingouin.com.br`, `euamotrico.com.br`, `garnstudio.com/video.php?id=216&lang=pt`
   - **Costura**: `patriciamuller.com.br/patchwork-descomplicado-a/`
   - **Bordado Terra de Sousa (PDF institucional)**: `https://cm-felgueiras.pt/wpfd_file/catalogo-de-pontos-do-bordado-terra-de-sousa/` (a URL `.../download/1152/...` citada antes não existe — usar esta)
6.3. Salvar cada PDF em `frontend/public/materiais/<tecnica>/<nome-padronizado>.pdf`. Convenção: `<tecnica>-<nivel>-<aula>-<ordem>.pdf`
6.4. Manter PDFs pequenos (< 5 MB cada). Comprimir com `gs -dPDFSETTINGS=/ebook` se necessário.

## Passo 7 — Atualizar o `seed_demo.py` (meio dia)
7.1. Para cada material no `TRILHAS_DEMO`:
   - **Vídeo**: `url = "https://www.youtube-nocookie.com/embed/VIDEO_ID"`, preencher `duracao_seg`, `thumbnail_url`, `fonte` (canal), `licenca: "YouTube embed"`
   - **Imagem de terceiros**: `url = "https://upload.wikimedia.org/..."`, preencher `fonte` (autor), `licenca` (ex. "CC-BY-SA 4.0")
   - **Imagem/PDF próprio**: `url = "/materiais/<tecnica>/<nome>.pdf"` (relativa), `licenca: "Proprietário Arakne"`, `fonte: "Equipe Arakne"`
7.2. Para as 5 aulas não-portal da trilha #9: remover materiais do dict (`"materiais": []`) e ajustar `descricao` para "Em breve, nova aula exclusiva da comunidade Arakne."
7.3. Rodar `cd backend && python seed_demo.py` e confirmar a saída mostra ~130 materiais criados

## Passo 8 — Ajustar o `AulaPage.tsx` (opcional, 1h)
8.1. Se `thumbnail_url` foi adicionado: modificar o bloco de vídeo para mostrar thumbnail antes de carregar o iframe (lazy load — só instancia `<iframe>` ao clicar). Melhora performance e privacidade (não carrega YouTube até clicar).
8.2. Se `duracao_seg` foi adicionado: exibir "12:30" ao lado do título do vídeo.

## Passo 9 — Validar ponta a ponta (meio dia)
9.1. Subir o stack: `cd backend && uvicorn app.main:app --reload --port 8000` e `cd frontend && npm run dev`
9.2. Abrir `http://localhost:5173`, navegar até cada uma das 9 trilhas, entrar em cada aula, confirmar:
   - PDFs abrem em nova aba (link funciona)
   - Imagens carregam (sem erro de CSP no console)
   - Vídeos do YouTube embedam (sem erro de CSP `frame-src`)
   - Botão "Concluir aula" funciona
9.3. Rodar `pytest` no backend para garantir que nada quebrou
9.4. Rodar `npm run build` no frontend para garantir que `tsc` passa (se o tipo `Material` foi estendido)

## Passo 10 — Documentar atribuições (meio dia)
10.1. Criar `frontend/public/materiais/ATTRIBUTIONS.md` listando, para cada material de terceiros: título, autor, URL original, licença. Necessário para cumprir CC-BY/CC-BY-SA.
10.2. Linkar esse arquivo na página "Sobre" do app (se houver) ou no rodapé.

## Passo 11 — Commit e deploy
11.1. `git add` dos PDFs/imagens próprios em `frontend/public/materiais/` (manter tamanho total < 50 MB)
11.2. Commit do `seed_demo.py` atualizado, `index.html` (CSP), `material.py` (schema se mudou), `types.ts`, `AulaPage.tsx`, `ATTRIBUTIONS.md`
11.3. Push. CI roda `npm run test` no root app (não cobre backend/frontend standalone — validar manualmente)

---

## Resumo
- **Tempo total**: ~5-7 dias de uma pessoa, paralelizável em curadoria de vídeo (Passo 4) + produção de PDF (Passo 6)
- **Hospedagem**: PDFs/imagens próprios em `frontend/public/materiais/`, diagramas do Wikimedia Commons (CC), vídeos do YouTube `youtube-nocookie.com` embed
- **CSP**: adicionar `frame-src https://www.youtube-nocookie.com`, `img-src ... https://upload.wikimedia.org`, `media-src 'self'`
- **Schema**: manter os 7 campos atuais; adicionar opcionalmente `licenca`, `fonte`, `duracao_seg`, `thumbnail_url` (nullable, sem breaking change)
- **Workflow**: editar `seed_demo.py` + commit de binários pequenos; sem endpoint de upload no escopo atual
- **Trilha #9 (Ponto Arakne)**: deixar as 5 aulas não-portal como "Em breve" — conteúdo exclusivo a ser produzido pela equipe

## Riscos e mitigações
| Risco | Mitigação |
|---|---|
| Vídeo do YouTube sai do ar | Adicionar campo `url_backup` (opcional) ou monitorar com script periódico |
| Atribuição esquecida (CC-BY) | Campos `fonte` + `licenca` obrigatórios no seed para materiais externos; revisão no PR |
| CSP muito restritiva quebra conteúdo | Testar no Passo 9 antes de commitar |
| PDFs próprios pesados | Comprimir com `gs`; limite ~5 MB/PDF |
| Schema drift no SQLite | Deletar `arakne.db` e rodar `seed_demo.py` (já é o fluxo de demo) |
| Trilha #9 sem conteúdo | Deixar 5 aulas como "Em breve" — não forçar conteúdo externo |
| Privacidade (YouTube rastreia) | Usar `youtube-nocookie.com`; lazy-load do iframe só ao clicar |
