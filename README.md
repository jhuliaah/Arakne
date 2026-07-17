# Arakne

App de aprendizado de crochê/tecelagem que, por baixo, é uma rede de
microcrédito peer-to-peer via Lightning Network para mulheres sem acesso
bancário por controle financeiro coercitivo.

Projeto do hackathon **hack4freedom** (só mulheres).

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
| Frontend   | React + Vite         | 5173  | PWA mobile-first                |

---

## Pré-requisitos

- **Docker** 24+
- **Docker Compose** v2+ (`docker compose` — não o `docker-compose` legado)

### Pre-pull de imagens (offline)

Antes do evento (com internet), rode:

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
# 1. Clonar / abrir o projeto
cd arakne

# 2. Subir todos os serviços
docker compose up --build

# 3. (em outro terminal) configurar Lightning
bash scripts/init-lightning.sh
```

### Verificação rápida

| Verificação                    | Como                                    |
|--------------------------------|-----------------------------------------|
| Backend no ar                  | `curl http://localhost:8000/health`     |
| Frontend carregando            | Abrir `http://localhost:5173`           |
| LNbits acessível               | Abrir `http://localhost:5000`           |
| LNbits: criar wallet de teste  | UI do LNbits → "Add new wallet"         |
| Auth: criar usuária            | `curl -X POST http://localhost:8000/usuarias ...` (ver abaixo) |

---

## Migração de banco de dados

**Estratégia:** `Base.metadata.create_all()` (SQLAlchemy) — executada
automaticamente no startup do FastAPI (`app/main.py`).

Não usamos Alembic nesta fase. O `create_all()` é idempotente: cria tabelas
que ainda não existem, sem tocar nas existentes. Para o hackathon (demo local,
SQLite), isso é suficiente. Se for necessário versionar schemas no futuro,
basta adicionar Alembic e um `alembic.ini` em `backend/`.

---

## Autenticação pseudônima

O cadastro **não pede nome, CPF, e-mail, nem nenhum dado de identidade real**.
A usuária fornece apenas um PIN local. O sistema gera:

- **`identificador`** — string aleatória opaca (ex: `K7x9_aBcD1e`) que substitui login/e-mail
- **`codigo_indicacao`** — código de indicação próprio da usuária (para tier 3)
- **`pin_hash`** — PIN hasheado com bcrypt (nunca armazenado em texto puro)

Tokens de sessão são strings opacas aleatórias, armazenadas na tabela `sessoes`
com expiração de 30 dias.

### Endpoints

#### POST /usuarias — criar usuária

```bash
curl -X POST http://localhost:8000/usuarias \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'

# Com código de indicação (opcional):
curl -X POST http://localhost:8000/usuarias \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234", "codigo_indicacao": "Rt3_mN9p"}'
```

Resposta (201):
```json
{
  "identificador": "K7x9_aBcD1e",
  "codigo_indicacao": "Rt3_mN9p",
  "codigo_indicacao_usado": null,
  "tier": 0,
  "saldo_devedor": 0,
  "tier_congelado": false,
  "padroes_completos": 0,
  "criado_em": "2025-07-13T20:15:00"
}
```

> Guarde o `identificador` — ele é a única forma de logar.

#### POST /login — obter token de sessão

```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"identificador": "K7x9_aBcD1e", "pin": "1234"}'
```

Resposta (200):
```json
{
  "token": "s3kr3t_t0k3n...",
  "token_type": "bearer",
  "identificador": "K7x9_aBcD1e"
}
```

#### GET /usuarias/me — dados da própria usuária

```bash
curl http://localhost:8000/usuarias/me \
  -H "Authorization: Bearer s3kr3t_t0k3n..."
```

Resposta (200): mesmo formato do cadastro, sem `pin_hash`, `avalista_id`, ou `id` interno.

#### GET /usuarias/me/convite — gerar link de convite (tier 3+ apenas)

```bash
curl http://localhost:8000/usuarias/me/convite \
  -H "Authorization: Bearer s3kr3t_t0k3n..."
```

Resposta (200):
```json
{
  "codigo": "Rt3_mN9p",
  "link": "/convite/Rt3_mN9p"
}
```

Disponível apenas para usuárias em tier 3 ou superior (`pode_avalizar`).
Ao cadastrar uma nova usuária com esse `codigo_indicacao`, o Aval é criado
automaticamente e a nova usuária já nasce com tier 1.

---

## Integração com LNbits

O backend integra com a API REST do LNbits para criar wallets, gerar invoices
Lightning, e confirmar pagamentos. Cada Usuaria recebe uma wallet dedicada no
LNbits no momento do cadastro.

### Configuração

Sem configuração, o backend opera em **modo mock** (simula invoices sem LNbits).
Para habilitar pagamentos reais:

1. Suba os serviços: `docker compose up --build`
2. Acesse `http://localhost:5000` (LNbits) — copie a **admin key** da wallet
3. Crie uma wallet "pool" no LNbits e copie a admin key dela
4. Crie um `.env` na raiz do projeto:

```bash
LNBITS_ADMIN_KEY=sua_admin_key_aqui
LNBITS_POOL_KEY=sua_pool_admin_key_aqui
```

5. Reinicie o backend: `docker compose restart backend`

### Endpoints de microcrédito

#### POST /avais — dar aval (uma usuária avalia outra)

```bash
curl -X POST http://localhost:8000/avais \
  -H "Content-Type: application/json" \
  -d '{"avalista_identificador": "K7x9...", "nova_usuaria_identificador": "A1b2..."}'
```

Cria registro de Aval, define `avalista_id` na nova usuária, e sobe tier 0→1.

#### POST /emprestimos/{identificador} — solicitar empréstimo

```bash
curl -X POST http://localhost:8000/emprestimos/A1b2...
```

Valida `pode_emprestar()`, gera invoice Lightning no valor do limite do tier,
paga da wallet pool, e registra o empréstimo como ativo.

Resposta (201):
```json
{
  "id": 1,
  "usuaria_id": 2,
  "valor_sats": 5000,
  "invoice_id": "mock_...",
  "status": "ativo",
  "criado_em": "2025-07-13T21:00:00",
  "quitado_em": null,
  "invoice_bolt11": "lnbc5000mock..."
}
```

#### POST /emprestimos/{id}/pagamento — pagar empréstimo

```bash
curl -X POST http://localhost:8000/emprestimos/1/pagamento \
  -H "Content-Type: application/json" \
  -d '{"valor_sats": 5000}'
```

Gera invoice na pool wallet, a wallet da usuária paga, atualiza `saldo_devedor`.
Se zerar, chama `ao_quitar()` (sobe tier) e marca como "quitado".

Resposta (200):
```json
{
  "emprestimo_id": 1,
  "valor_pago": 5000,
  "saldo_devedor": 0,
  "quitado": true,
  "tier": 2
}
```

#### GET /emprestimos/{id} — detalhes do empréstimo

```bash
curl http://localhost:8000/emprestimos/1
```

#### GET /emprestimos/{id}/status — polling de pagamento no LNbits

```bash
curl http://localhost:8000/emprestimos/1/status
```

Verifica no LNbits se o invoice foi pago. Retorna `{status, paid, saldo_devedor}`.

### Fluxo completo via curl

```bash
# 1. Criar avalista
A=$(curl -s -X POST http://localhost:8000/usuarias \
  -H "Content-Type: application/json" -d '{"pin":"1234"}' | jq -r .identificador)

# 2. Criar nova usuária
B=$(curl -s -X POST http://localhost:8000/usuarias \
  -H "Content-Type: application/json" -d '{"pin":"5678"}' | jq -r .identificador)

# 3. Dar aval (tier 0→1)
curl -s -X POST http://localhost:8000/avais \
  -H "Content-Type: application/json" \
  -d "{\"avalista_identificador\":\"$A\",\"nova_usuaria_identificador\":\"$B\"}"

# 4. Pedir empréstimo (tier 1 = 5.000 sats)
curl -s -X POST http://localhost:8000/emprestimos/$B

# 5. Pagar (simulado)
curl -s -X POST http://localhost:8000/emprestimos/1/pagamento \
  -H "Content-Type: application/json" -d '{"valor_sats":5000}'
# → {"quitado": true, "tier": 2, "saldo_devedor": 0}
```

---

## Estrutura do repositório

```
arakne/
├── docker-compose.yml        # orquestra todos os serviços
├── config/
│   ├── bitcoin/
│   │   └── bitcoin.conf      # Bitcoin Core (regtest)
│   └── lnd/
│       └── lnd.conf          # LND (regtest)
├── scripts/
│   └── init-lightning.sh     # setup do Bitcoin + LND
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   └── app/
│       ├── __init__.py
│       ├── main.py            # FastAPI app + create_all()
│       ├── database.py        # SQLAlchemy engine + session
│       ├── config.py          # env vars (LNbits URL, keys)
│       ├── auth.py            # hash PIN, sessão, get_current_usuaria
│       ├── models/
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── usuaria.py
│       │   ├── sessao.py
│       │   ├── padrao.py
│       │   ├── progresso.py
│       │   ├── emprestimo.py
│       │   └── aval.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── usuaria.py
│       │   ├── auth.py
│       │   ├── emprestimo.py
│       │   └── aval.py
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── health.py      # GET /health
│       │   ├── auth.py        # POST /login
│       │   ├── usuarias.py    # POST /usuarias, GET /usuarias/me, GET /usuarias/me/convite
│       │   ├── avais.py       # POST /avais
│       │   └── emprestimos.py # POST /emprestimos, POST /pagamento, GET /status
│       ├── services/
│       │   ├── __init__.py
│       │   ├── risco.py       # motor de risco
│       │   └── lnbits.py      # LNbits API client + mock fallback
│       └── tests/
│           ├── __init__.py
│           ├── conftest.py
│           ├── test_health.py
│           ├── test_risco.py
│           └── test_emprestimos.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── styles.css
```

---

## Modelo de dados

| Tabela           | Campos principais                                                      |
|------------------|------------------------------------------------------------------------|
| **Usuaria**      | id, identificador, pin_hash, lnbits_wallet_key, codigo_indicacao, codigo_indicacao_usado, tier (0-3), saldo_devedor, tier_congelado, avalista_id (FK), padroes_completos, criado_em |
| **Sessao**       | id, usuaria_id (FK), token, criada_em, expira_em                       |
| **Padrao**       | id, nivel, nome_publico, sats_desbloqueados                            |
| **ProgressoPadrao** | usuaria_id, padrao_id, completo_em                                  |
| **Emprestimo**   | id, usuaria_id, valor_sats, invoice_id, status, criado_em, quitado_em  |
| **Aval**         | usuaria_que_avaliza_id, nova_usuaria_id, criado_em                     |

> **Nenhum campo de identidade real** (nome, CPF, e-mail) existe no banco.
> A coluna `avalista_id` existe para o motor de risco calcular elegibilidade,
> mas **nunca aparece na interface** — nem para a própria usuária.

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

---

## Demo do júri

### Preparação

```bash
cd backend
python seed_demo.py          # reseta o banco e cria Usuária A (tier 1)
uvicorn app.main:app --port 8000   # sobe o backend
```

### Roteiro automatizado (verifica todo o fluxo)

```bash
python run_demo.py
```

O script executa:
1. Seed (reseta banco + cria Usuária A em tier 1)
2. Usuária B nasce pelo convite de A → tier 1 automático
3. B pede empréstimo (5.000 sats)
4. B paga parcialmente (2.000) → saldo abaixa para 3.000
5. B paga o restante (3.000) → tier sobe para 2
6. Verificação final

**Tempo esperado:** < 10s (mock mode, sem rede Lightning real).

### Roteiro manual (pela interface)

1. Rodar `python seed_demo.py` + `uvicorn` + `docker compose up frontend`
2. Abrir `http://localhost:5173/convite/DEMO_A_INVITE`
   - Usuária B é criada + aval automático → tier 1
3. Digitar "Ponto Arakne" na busca → tela "Meus Materiais"
4. Clicar "Solicitar Kit de Material" → empréstimo de 5.000
5. Clicar "Concluir Padrão" → pagar 2.000 (parcial) → saldo 3.000
6. Clicar "Concluir Padrão" → pagar 3.000 (restante) → tier sobe para 2

### Dados de seed

| Usuária | Identificador | PIN | Tier | Notas |
|---------|----------------|-----|------|-------|
| A | `demo_usuaria_a` | `1234` | 1 | Pronta para demo, saldo 0 |
| Shadow | `shadow_avalista_seed` | `0000` | 3 | Descartável, só para o aval de A |
| B | (criada na demo) | `5678` | 1 | Nasce pelo link `/convite/DEMO_A_INVITE` |

---

## Desenvolvimento local (sem Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Notas de segurança

- A tela inicial é um catálogo de padrões de crochê — **nenhum símbolo cripto** visível.
- Notificações usam linguagem têxtil ("novo padrão disponível").
- O gesto de busca por um padrão-código revela a tela financeira.
- O grafo de avalistas **nunca** aparece na interface.
- PIN hasheado com bcrypt — nunca armazenado em texto puro.
- Tokens de sessão são opacos e expiram em 30 dias.

---

## Licença

Projeto de hackathon. Todos os direitos reservados às autoras.
