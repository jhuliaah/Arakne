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
│       ├── main.py            # FastAPI app
│       ├── database.py        # SQLAlchemy engine + session
│       ├── models/
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── usuaria.py
│       │   ├── padrao.py
│       │   ├── progresso.py
│       │   ├── emprestimo.py
│       │   └── aval.py
│       ├── routers/
│       │   ├── __init__.py
│       │   └── health.py      # GET /health
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
| **Usuaria**      | id, codigo_indicacao_usado, tier (0-3), saldo_devedor, tier_congelado, avalista_id (FK), padroes_completos, criado_em |
| **Padrao**       | id, nivel, nome_publico, sats_desbloqueados                            |
| **ProgressoPadrao** | usuaria_id, padrao_id, completo_em                                  |
| **Emprestimo**   | id, usuaria_id, valor_sats, invoice_id, status, criado_em, quitado_em  |
| **Aval**         | usuaria_que_avaliza_id, nova_usuaria_id, criado_em                     |

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

---

## Licença

Projeto de hackathon. Todos os direitos reservados às autoras.
