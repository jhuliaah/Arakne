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
│       │   └── auth.py
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── health.py      # GET /health
│       │   ├── auth.py        # POST /login
│       │   └── usuarias.py    # POST /usuarias, GET /usuarias/me
│       ├── services/
│       │   └── __init__.py
│       └── tests/
│           ├── __init__.py
│           ├── conftest.py
│           └── test_health.py
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
| **Usuaria**      | id, identificador, pin_hash, codigo_indicacao, codigo_indicacao_usado, tier (0-3), saldo_devedor, tier_congelado, avalista_id (FK), padroes_completos, criado_em |
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
