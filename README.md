# Arakne

App de aprendizado de crochê/tecelagem que, por baixo, é uma rede de
microcrédito peer-to-peer via Lightning Network para mulheres sem acesso
bancário por controle financeiro coercitivo. O crochê é a superfície visível;
as funcionalidades financeiras são reveladas por gestos de busca ocultos.

Projeto do hackathon **hack4freedom** (só mulheres).

> **Documentação canônica:** `Arakne-documento-mestre.md` é a referência
> arquitetural. Este README é um guia operacional. Convenções de
> desenvolvimento em `AGENTS.md`.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│  docker-compose                                     │
│                                                     │
│  ┌──────────┐   ┌─────┐   ┌────────┐               │
│  │ Bitcoin  │   │ LND │   │ LNbits │               │
│  │ (regtest)│←─→│     │←─→│        │               │
│  └──────────┘   └─────┘   └────────┘               │
│                                                     │
│  ┌──────────┐               ┌──────────┐           │
│  │ Backend  │               │ Frontend │           │
│  │ (FastAPI)│               │ (Vite)   │           │
│  │  :8000   │               │  :5173   │           │
│  └──────────┘               └──────────┘           │
└─────────────────────────────────────────────────────┘
```

| Serviço    | Tecnologia           | Porta | Descrição                       |
|------------|----------------------|-------|---------------------------------|
| Bitcoin    | Bitcoin Core 26      | 18443 | Node regtest com ZMQ            |
| LND        | LND v0.18            | 10009 | Lightning node (regtest)        |
| LNbits     | LNbits 0.12          | 5000  | Wallet manager / API            |
| Backend    | Python + FastAPI     | 8000  | API REST + SQLite               |
| Frontend   | React 18 + Vite      | 5173  | PWA mobile-first                |

> O repo também contém um app Nostr híbrido na raiz `src/` (React 19 +
> Nostrify), separado do `frontend/` standalone. A recuperação de conta e
> a camada Arakne vivem em `frontend/` + `backend/`. Veja `AGENTS.md` para
> o detalhamento das duas apps.

---

## Pré-requisitos

- **Docker** 24+
- **Docker Compose** v2+ (`docker compose` — não o `docker-compose` legado)

### Pre-pull de imagens (offline)

```bash
docker pull lncm/bitcoind:26.0
docker pull lightninglabs/lnd:v0.18.0-beta
docker pull lnbits/lnbits:0.12.9
docker pull python:3.12-slim
docker pull node:20-slim
```

---

## Como subir tudo

```bash
docker compose up --build
bash scripts/init-lightning.sh   # em outro terminal, APÓS compose up
```

### Desenvolvimento local (sem Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python seed_demo.py                                   # reseta DB + cria FUNDADORA + FORNECEDORA
uvicorn app.main:app --port 8000 --reload --reload-exclude "*.db" --reload-exclude "*.db-*"
```

> **Importante:** o `--reload-exclude "*.db"` é obrigatório em desenvolvimento
> local. Sem ele, o uvicorn assiste o diretório `backend/` e recarrega a cada
> escrita no `arakne.db` (login, concluir aula, troca, empréstimo) — o backend
> cai após poucos segundos de uso. O `Dockerfile` já aplica o exclude.

**Frontend:**
```bash
cd frontend
npm install
npm run dev    # vite em :5173, proxy /api -> backend
```

### Verificação rápida

| Verificação           | Como                                |
|-----------------------|-------------------------------------|
| Backend no ar         | `curl http://localhost:8000/health` |
| Frontend carregando   | Abrir `http://localhost:5173`       |
| LNbits acessível      | Abrir `http://localhost:5000`       |
| Seed criou mestras   | `python seed_demo.py` lista FUNDADORA + FORNECEDORA |

---

## Migração de banco de dados

**Estratégia:** `Base.metadata.create_all()` (SQLAlchemy) — executada
automaticamente no startup do FastAPI (`app/main.py`). Não usamos Alembic.

O `main.py` tem uma **schema-drift safety net**: se a tabela `usuarias`
existente estiver faltando colunas, ele dropa e recria todas as tabelas.
Para adicionar uma coluna nova em desenvolvimento local, delete
`backend/arakne.db` e rode `python seed_demo.py` (recria do zero).

---

## Autenticação pseudônima

O cadastro **não pede nome, CPF, e-mail, nem nenhum dado de identidade real**.
A usuária escolhe um PIN (4-8 dígitos) e um apelido opcional. O sistema gera:

- **`identificador`** — string opaca (login/e-mail substituto)
- **`codigo_indicacao`** — código de convite próprio (para tier 3)
- **`apelido`** — nome de exibição (opcional, mostrado em vez do npub)
- **`pin_hash`** — PIN hasheado com bcrypt

Tokens de sessão são strings opacas, 30 dias de expiração. CORS é
`allow_origins=["*"]` com `allow_credentials=False` (Bearer-token auth,
sem cookies).

### Endpoints de usuária

| Método | Path                                          | Auth | Descrição                                  |
|--------|-----------------------------------------------|------|--------------------------------------------|
| POST   | `/usuarias`                                   | —    | Criar usuária (PIN 4-8 dígitos + apelido)   |
| GET    | `/usuarias/me`                                | Bearer | Dados da própria usuária                 |
| PATCH  | `/usuarias/me/npub`                           | Bearer | Vincular npub Nostr (demo-setup)         |
| PATCH  | `/usuarias/me/apelido`                        | Bearer | Atualizar apelido                        |
| GET    | `/usuarias/me/convite`                        | Bearer | Gerar link de convite (tier 3+)          |
| GET    | `/usuarias/me/avalistas-recuperacao`          | Bearer | Lista de tecelãs vinculadas              |
| POST   | `/usuarias/me/avalistas-recuperacao`          | Bearer | Vincular tecelã posteriormente           |
| POST   | `/usuarias/me/recovery-share`                 | Bearer | Upsert share 1 (criptografada com PIN)    |
| GET    | `/usuarias/me/recovery-share`                 | Bearer | Baixar share 1                            |
| GET    | `/usuarias/by-identificador/{id}/npub`        | —    | Lookup público de npub                    |
| GET    | `/usuarias/by-identificador/{id}/avalistas-recuperacao` | — | Lookup público de tecelãs (com apelido) |

---

## Recuperação de conta (2FA social)

Modelo: **1 PIN + 1 nsec**, com recuperação social via **Opção E** (SSSS
T=2,N=2 — threshold criptográfico real) + **QR on-demand**.

- **Share 0** → tecelã de confiança via NIP-59 gift-wrap (kind 1059)
- **Share 1** → backend, criptografada com PIN
- **Recuperação**: convidada pede ajuda (disfarçado "pedir aula de ponto")
  → tecelã vê sino 🎀 → desembrulha share 0 → gera QR efêmero (canvas, TTL
  5min) → convidada escaneia → combina share 0 + share 1 (via PIN) →
  reconstrói nsec → adota novo Ponto Arakne.

**Travamento §5.2 "pernas da aranha":** após 8 tentativas falhas de
PIN/padrão, bloqueio com backoff exponencial (1min → 24h). "Sair" não
apaga a identidade (mantém nsec criptografado no localStorage para
re-acesso); "Desfazer todos os pontos" apaga a identidade real.

> A recuperação vive em `frontend/src/lib/{ssss,recovery-*,gift-wrap,
> pattern-crypto,pattern-storage}.ts` + `frontend/src/components/Recovery*`
> + `frontend/src/pages/onboarding/Recover*`. O backend só guarda a
> share 1 e os slots de tecelãs.

---

## Trilhas de aprendizagem (camada disfarce)

9 trilhas, 54 aulas, 127 materiais (seed). A trilha 9 / nível 1 / ordem 1
é o **portal disfarçado** "Aula: Ponto Renascido" — revela a camada
financeira para quem já tem identidade, ou leva ao onboarding para quem
não tem.

| Método | Path                                  | Auth | Descrição                          |
|--------|---------------------------------------|------|------------------------------------|
| GET    | `/trilhas`                            | —    | Lista todas as trilhas             |
| GET    | `/trilhas/{id}`                       | —    | Detalhe de uma trilha com aulas    |
| GET    | `/trilhas/me`                         | Bearer | Trilhas em que a usuária tem progresso |
| POST   | `/trilhas/{id}/inscrever`            | Bearer | Inscrever em todas as aulas da trilha |
| POST   | `/trilhas/aulas/{aula_id}/iniciar`   | Bearer | Iniciar uma aula específica       |
| POST   | `/trilhas/aulas/{aula_id}/concluir`  | Bearer | Concluir aula                      |

---

## Microcrédito (camada financeira)

### Empréstimos

| Método | Path                          | Auth | Descrição                          |
|--------|-------------------------------|------|------------------------------------|
| POST   | `/emprestimos/{identificador}` | Bearer | Solicitar empréstimo (gera invoice) |
| POST   | `/emprestimos/{id}/pagamento`  | Bearer | Pagar (parcial ou total)           |
| GET    | `/emprestimos/{id}`            | Bearer | Detalhes                           |
| GET    | `/emprestimos/{id}/status`     | Bearer | Polling LNbits                     |

### Pontos de Troca (Fornecedora de Linha)

Fluxo com **aprovação explícita da fornecedora**: solicitante pede troca
→ status `pendente` → fornecedora vê no sino e na FinancialPage →
`confirmar` (incrementa reputação) ou `recusar`.

| Método | Path                                       | Auth | Descrição                          |
|--------|--------------------------------------------|------|------------------------------------|
| PUT    | `/pontos-de-troca/disponibilidade`         | Bearer | Ativar/desativar-se como ponto    |
| GET    | `/pontos-de-troca`                          | —    | Lista de pontos disponíveis       |
| POST   | `/trocas`                                  | Bearer | Solicitar troca (fica pendente)   |
| POST   | `/trocas/{id}/confirmar`                    | Bearer | Fornecedora confirma (só o ponto) |
| POST   | `/trocas/{id}/recusar`                      | Bearer | Fornecedora recusa (só o ponto)   |
| GET    | `/trocas/minhas`                            | Bearer | Trocas como solicitante e como ponto |

### Avals (motor de risco)

| Método | Path     | Auth | Descrição                          |
|--------|----------|------|------------------------------------|
| POST   | `/avais` | —    | Uma usuária avalia outra (tier 0→1) |

### Pix e Custódia (time financeiro)

| Método | Path                  | Auth | Descrição                          |
|--------|-----------------------|------|------------------------------------|
| POST   | `/pix/cobranca`       | Bearer | Gerar cobrança Pix                |
| GET    | `/pix/cobranca/{txid}` | Bearer | Status da cobrança               |
| POST   | `/pix/webhook`        | —    | Webhook Mercado Pago              |
| GET    | `/custodia`           | —    | Dados públicos da reserva fria multisig |

---

## Integração com LNbits

Sem `LNBITS_ADMIN_KEY` / `LNBITS_POOL_KEY`, o backend opera em **modo mock**
(simula invoices). Para pagamentos reais:

1. `docker compose up --build`
2. Acesse `http://localhost:5000` (LNbits) → copie a admin key da wallet
3. Crie uma wallet "pool" no LNbits e copie a admin key
4. Crie um `.env` na raiz:
   ```bash
   LNBITS_ADMIN_KEY=sua_admin_key_aqui
   LNBITS_POOL_KEY=sua_pool_admin_key_aqui
   ```
5. `docker compose restart backend`

---

## Estrutura do repositório

```
arakne/
├── docker-compose.yml
├── AGENTS.md                    # convenções de desenvolvimento
├── Arakne-documento-mestre.md   # referência arquitetural canônica
├── config/                      # bitcoin + lnd (regtest)
├── scripts/                     # init-lightning, multisig
├── src/                         # app Nostr híbrido (React 19 + Nostrify)
├── backend/
│   ├── seed_demo.py             # reseta DB + cria FUNDADORA + FORNECEDORA
│   ├── run_demo.py              # demo end-to-end via API (<10s, mock)
│   └── app/
│       ├── main.py              # FastAPI app + create_all() + drift safety
│       ├── models/              # 11 modelos (Usuaria, Sessao, Emprestimo,
│       │                        #   Aval, Troca, Trilha, Aula, Material,
│       │                        #   ProgressoAula, AvalistaRecuperacao,
│       │                        #   RecoveryShareBackup, PagamentoPix, ...)
│       ├── routers/             # 9 routers (health, auth, usuarias, avais,
│       │                        #   emprestimos, pontos_troca, trilhas, pix,
│       │                        #   custodia)
│       ├── schemas/             # Pydantic schemas
│       ├── services/            # risco, lnbits, bech32, pix
│       └── tests/               # pytest (111 testes)
└── frontend/
    ├── package.json
    └── src/
        ├── App.tsx              # máquina de estados (sem React Router)
        ├── api.ts               # cliente API + localStorage keys
        ├── styles.css           # tipografia Cinzel + Fraunces + Inter
        ├── components/           # RecoveryBell, RecoveryQRGenerator,
        │                        #   RecoveryScanner, MeuCodigoQR, Header
        ├── hooks/               # useRecoveryListener, useRecoveryBellData
        ├── lib/                 # ssss, recovery-*, gift-wrap, pattern-crypto
        ├── pages/
        │   ├── onboarding/      # Splash, CreateAccount, RecoverAccount,
        │   │                    #   RecoverySetup, RecoveryHelpRequest
        │   ├── FinancialPage.tsx    # camada financeira (troca, QR, tecelã)
        │   ├── PerfilPage.tsx       # bancada (nível/tier)
        │   ├── TrilhasPage.tsx      # catálogo disfarce
        │   ├── MeusProjetosPage.tsx # trilhas em andamento
        │   └── ...
        └── types.ts
```

---

## Modelo de dados

| Tabela                  | Campos principais                                                              |
|-------------------------|--------------------------------------------------------------------------------|
| **Usuaria**             | id, identificador, pin_hash, apelido, npub, lnbits_wallet_key, codigo_indicacao, codigo_indicacao_usado, tier (0-3), saldo_devedor, tier_congelado, avalista_id (FK self), disponivel_como_ponto, trocas_como_ponto_concluidas, padroes_completos, criado_em |
| **Sessao**              | id, usuaria_id, token, criada_em, expira_em                                     |
| **Emprestimo**          | id, usuaria_id, valor_sats, invoice_id, status, criado_em, quitado_em           |
| **Aval**                | usuaria_que_avaliza_id, nova_usuaria_id, criado_em                              |
| **Troca**               | id, solicitante_id, ponto_id, valor_sats, status, criado_em, confirmada_em     |
| **Trilha / Aula / Material** | trilha_id, nivel, ordem, aula_id, material_id, url, ...                  |
| **ProgressoAula**       | usuaria_id, aula_id, concluida, concluida_em, inscrita_em                      |
| **AvalistaRecuperacao** | usuaria_id, npub_avaliadora, ordem, is_shadow, criado_em                        |
| **RecoveryShareBackup** | usuaria_id (unique), encrypted_share_blob, criado_em                            |
| **PagamentoPix / CustodiaMultisig** | (time financeiro)                                                |

> **Nenhum campo de identidade real** (nome, CPF, e-mail). `avalista_id`
> existe para o motor de risco mas **nunca aparece na interface**.

---

## Motor de risco

| Tier | Condição                     | Limite (sats) |
|------|-------------------------------|---------------|
| 0    | Sem crédito                   | —             |
| 1    | 1 aval recebido               | 5.000         |
| 2    | Quitar tier 1                 | 15.000        |
| 3    | Quitar tier 2 + indicação     | 40.000        |

- Atraso >14 dias → `tier_congelado = true` (usuária + avalista)
- Completar padrões **não** libera crédito
- Nunca reduz tier retroativamente
- O nível da bancada (PerfilPage) e o tier financeiro (FinancialPage) são
  a mesma fonte (`usuaria.tier`) — sempre sincronizados.

---

## Demo do júri

### Preparação

```bash
cd backend
python seed_demo.py          # reseta o banco + cria FUNDADORA + FORNECEDORA
uvicorn app.main:app --port 8000 --reload --reload-exclude "*.db" --reload-exclude "*.db-*"
# em outro terminal:
cd frontend && npm run dev
```

### Roteiro automatizado (verifica todo o fluxo de microcrédito)

```bash
cd backend
python run_demo.py    # <10s, mock mode
```

### Roteiro manual (pela interface)

1. Abrir `http://localhost:5173/demo-setup`
   - Gera nsec/npub, faz login da Fundadora, atualiza npub
   - Mostra identificador + PIN + padrão + convite
2. Abrir `http://localhost:5173/convite/FUNDADORA_INVITE`
   - Cria Perfil 1 (convidada pela Fundadora, tier 1)
3. Abrir `http://localhost:5173/convite/FUNDADORA_INVITE` (ou `FORNECEDORA_INVITE`)
   - Cria Perfil 2 (mesmo link gera 2º cadastro via "Iniciar novo projeto")
4. Na conta Fundadora: buscar "Ponto Arakne" → tela financeira
5. Transferir (ponto de troca) entre Fundadora e Perfil 1/2
6. Testar recuperação: deslogar → "Recuperar acesso" → "pedir aula de ponto"

### Dados de seed

| Usuária      | Identificador  | PIN  | Tier | Notas                                  |
|--------------|----------------|------|------|----------------------------------------|
| Fundadora    | `FUNDADORA`    | 1234 | 3    | Mestra, npub via /demo-setup           |
| Fornecedora  | `FORNECEDORA`  | 1234 | 3    | Mestra, ponto de troca para testes     |
| Convidada    | (criada na demo) | —  | 1    | Nasce pelo link `/convite/FUNDADORA_INVITE` |

---

## Notas de segurança

- A tela inicial é um catálogo de padrões de crochê — **nenhum símbolo cripto** visível.
- Notificações usam linguagem têxtil ("novo padrão disponível", "aula de ponto").
- O gesto de busca por um padrão-código revela a tela financeira.
- O grafo de avalistas **nunca** aparece na interface.
- PIN hasheado com bcrypt — nunca armazenado em texto puro.
- Tokens de sessão são opacos e expiram em 30 dias.
- nsec Nostr criptografado no localStorage (AES-GCM + PBKDF2 600k).
- Travamento após 8 tentativas falhas (backoff exponencial).
- QR de recuperação renderizado em `<canvas>` (não `<img>`), TTL 5min,
  `user-select: none`, `pointer-events: none` — mitigação contra screenshot.

---

## Licença

Projeto de hackathon. Todos os direitos reservados às autoras.
