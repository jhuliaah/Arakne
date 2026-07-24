# Arakne

App de aprendizado de crochê/tecelagem que, por baixo, é uma rede de
microcrédito peer-to-peer via Lightning Network para mulheres sem acesso
bancário por controle financeiro coercitivo. O crochê é a superfície visível;
as funcionalidades financeiras são reveladas por gestos ocultos (desenhar o
Ponto Arakne na aula-portal da trilha 9).

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

- **Docker** 24+ e **Docker Compose** v2+ (para stack completa)
- **Python 3.12+** e **Node 20+** (para desenvolvimento local sem Docker)

### Desenvolvimento local (sem Docker)

Há um script que sobe backend + frontend com venv automático:

```bash
bash scripts/dev-up.sh --all   # cria venv, instala deps, roda seed + multisig + tunnel, sobe tudo
bash scripts/dev-up.sh --mock  # DEMO: modo mock (zero credenciais reais), seed + sobe tudo
```

Ou manualmente:

**Backend:**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # PEP 668 (Python 3.14)
pip install -r requirements.txt
python seed_demo.py                                   # reseta DB + cria FUNDADORA + FORNECEDORA
uvicorn app.main:app --port 8000 --reload --reload-exclude "*.db" --reload-exclude "*.db-*"
```

> **Importante:** o `--reload-exclude "*.db"` é obrigatório em desenvolvimento
> local. Sem ele, o uvicorn recarrega a cada escrita no `arakne.db` e derruba
> o servidor.

**Frontend:**
```bash
cd frontend
npm install --legacy-peer-deps   # --legacy-peer-deps: @vitejs/plugin-react vs vite 8
npm run dev    # vite em :5173, proxy /api -> backend
```

### Stack completa (Docker)

```bash
docker compose up --build
bash scripts/init-lightning.sh   # em outro terminal, APÓS compose up
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
- **`pais`** — país (ISO alpha-2, ex: "BR" — habilita pagamentos via Pix)
- **`pin_hash`** — PIN hasheado com bcrypt

Tokens de sessão são strings opacas, 30 dias de expiração. CORS é
`allow_origins=["*"]` com `allow_credentials=False` (Bearer-token auth,
sem cookies).

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
| POST   | `/emprestimos/{identificador}` | —    | Solicitar empréstimo (gera invoice) |
| POST   | `/emprestimos/{id}/pagamento`  | —    | Pagar (parcial ou total)           |
| GET    | `/emprestimos/{id}`            | —    | Detalhes                           |
| GET    | `/emprestimos/{id}/status`     | —    | Polling LNbits                     |

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

### Pix (Mercado Pago)

| Método | Path                              | Auth | Descrição                          |
|--------|-----------------------------------|------|------------------------------------|
| POST   | `/pix/emprestimos/{id}/cobranca`  | —    | Gerar cobrança Pix para repagamento |
| GET    | `/pix/pagamentos/{txid}`          | —    | Status da cobrança (polling)       |
| POST   | `/pix/webhook`                    | —    | Webhook Mercado Pago (confirmação) |

### Carteira (Cesta de novelos)

| Método | Path                          | Auth | Descrição                          |
|--------|-------------------------------|------|------------------------------------|
| GET    | `/carteira/cotacao`           | Bearer | Cotação BTC/BRL (Binance)        |
| GET    | `/carteira/saldo`             | Bearer | Saldo em sats + BRL convertido   |
| GET    | `/carteira/transacoes`        | Bearer | Extrato da carteira              |
| POST   | `/carteira/depositar`         | Bearer | Gerar QR Pix para depósito        |
| POST   | `/carteira/pagar`             | Bearer | Pagar comerciante via Pix (off-ramp) |
| POST   | `/carteira/gerar-quitacao`    | Bearer | Gerar QR Pix para quitar empréstimo |

### Custódia (reserva fria multisig)

| Método | Path                  | Auth | Descrição                          |
|--------|-----------------------|------|------------------------------------|
| GET    | `/custodia/reserva-fria` | —    | Dados públicos da reserva fria multisig |

---

## Integração com LNbits

⚠️ **O LNbits do `docker-compose.yml` (Bitcoin/LND próprios) roda em
regtest — rede isolada, sem conexão com a Lightning Network real.** Serve
pra desenvolvimento/demo local, mas **não recebe pagamentos reais vindos de
fora** (ex.: um saque da Binance). Pra qualquer coisa com dinheiro real, use
uma instância hospedada em mainnet:

1. Acesse `https://demo.lnbits.com`, crie conta, crie uma wallet (ex.:
   `arakne-pool`)
2. Copie a **Admin key** e a **Invoice/read key** (ícone de chave dentro da
   wallet)
3. No `.env` da raiz:
   ```bash
   LNBITS_URL=https://demo.lnbits.com
   LNBITS_ADMIN_KEY=sua_admin_key_aqui
   LNBITS_POOL_KEY=mesma_admin_key_aqui
   ```
4. Reinicie o backend

Sem essas variáveis, o backend cai em **modo mock** (simula invoices e
saldo) — é o que roda `seed_demo.py`/`run_demo.py`, sem tocar em nada real.

---

## Pix (Mercado Pago) — repagamento

Repagamento de empréstimo via Pix Cobrança dinâmica, `txid` único por
transação (atribuição sem mapear identidade real — ver seção 8 do doc
mestre).

1. Conta de teste no [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
   → **Credenciais de teste** → Checkout Transparente
2. Copie o **Access Token** (não a Public Key — são campos diferentes, o
   Access Token é bem mais longo, formato `TEST-xxxxxxxx-xxxxxx-...`)
3. No `.env`:
   ```bash
   MP_ACCESS_TOKEN=TEST-seu-token-aqui
   MP_WEBHOOK_URL=https://sua-url-publica/pix/webhook  # ex.: túnel cloudflared
   ```
4. Pra receber confirmação automática, exponha o backend publicamente:
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```
   e cole a URL gerada (com `/pix/webhook` no final) em `MP_WEBHOOK_URL`.

**Limitação conhecida do sandbox:** pagamentos Pix em ambiente de teste na
API `/v1/payments` (Checkout Transparente) ficam `pending` pra sempre — não
existe simulação de pagamento via banco nessa API específica. Funciona
normal em produção; é só o sandbox que não fecha o loop sozinho.

Endpoints: `POST /pix/emprestimos/{id}/cobranca`, `GET /pix/pagamentos/{txid}`,
`POST /pix/webhook`.

---

## Binance — conversão BRL↔sats

Fecha o ciclo financeiro: BRL do repagamento Pix vira sats de volta pro
pool (seção 20 do doc mestre).

1. Conta na [Binance](https://www.binance.com), KYC completo (biometria +
   documento — costuma ser rápido)
2. **Perfil → Gerenciamento de API** → criar chave (HMAC)
3. Permissões: **Enable Reading** + **Enable Spot & Margin Trading** +
   **Enable Withdrawals**. A última exige restrição de IP — pegue o seu com
   `curl ifconfig.me` e cole na tela de criação da chave.
4. ⚠️ **A Secret Key só aparece uma vez** — copie os dois valores (API Key
   e Secret Key) antes de fechar a tela, ou terá que gerar outra.
5. ⚠️ **Toda conta nova (ou chave nova) fica com saque travado por 24-48h**
   por segurança da própria Binance — sem exceção, sem como acelerar.
6. No `.env`:
   ```bash
   BINANCE_API_KEY=sua_api_key
   BINANCE_API_SECRET=sua_secret_key
   ```

Métodos em `services/exchange.py`: `cotacao_btc_brl()` (pública),
`comprar_btc_mercado()`, `vender_btc_mercado()`, `sacar_lightning()`,
`gerar_invoice_deposito()`, `sacar_onchain()`. Diferente do LNbits/Pix, erro
real **nunca** cai em mock silencioso aqui — levanta `BinanceError`
explicitamente (envolve dinheiro real, mascarar falha como sucesso criaria
inconsistência contábil).

---

## Custódia — reserva fria multisig

Gerador offline (`scripts/gerar_multisig.py`, via `embit`), sem precisar de
nó Bitcoin rodando:

```bash
pip3 install -r scripts/requirements-multisig.txt --break-system-packages

# Demo — uma pessoa gera as 3 chaves. Só pra provar viabilidade técnica,
# NUNCA use com fundos de terceiros (anula o propósito da multisig).
# ⚠️ Rode FORA da pasta do repositório (o .json de saída tem as mnemonics
# e NUNCA pode ser commitado — já vazou uma vez nesta sessão).
mkdir -p ~/multisig-arakne && cd ~/multisig-arakne
python3 ~/Arakne/scripts/gerar_multisig.py --gerar-3-demo --network mainnet

# Produção — cada steward gera a própria chave isolada, só o xpub é
# compartilhado (nunca a mnemonic)
python3 ~/Arakne/scripts/gerar_multisig.py --gerar-1-steward --network mainnet
python3 ~/Arakne/scripts/gerar_multisig.py --combinar-xpubs steward1.json steward2.json steward3.json --network mainnet
```

Cola o descriptor/endereço gerado no `.env`:
```bash
MULTISIG_DESCRIPTOR=wsh(sortedmulti(2,...))#checksum
MULTISIG_ENDERECO=bc1q...
MULTISIG_QUORUM=2-de-3
MULTISIG_NETWORK=mainnet
```

Referência de leitura: `GET /custodia/reserva-fria` (nunca expõe chave
privada; lê do banco ou, na ausência, do `.env`).

**Importar no [Sparrow Wallet](https://sparrowwallet.com/):** `File → New
Wallet → Multisig`, cole os 3 `Zpub.../fingerprint/caminho de derivação`,
quorum 2-de-3. O endereço calculado pelo Sparrow deve bater com
`MULTISIG_ENDERECO`.

### Ponte quente → fria

O pool (LNbits) fala só Lightning; a reserva fria é on-chain — não existe
transferência direta entre os dois. A ponte usa a Binance como conversor de
protocolo: LNbits paga uma invoice → Binance recebe via Lightning → Binance
saca on-chain pra multisig.

```bash
# SEMPRE rode sem a flag primeiro — mostra o que faria, não executa nada
python3 scripts/mover_pool_para_reserva_fria.py

# Só depois de conferir os valores acima
python3 scripts/mover_pool_para_reserva_fria.py --confirmar-envio-real
```

---

## Breez SDK — carteira individual da usuária

Carteira Lightning **não-custodial** por usuária (distinto do pool, que é
custodial de propósito — ver seção 6 do doc mestre). Nunca use isto para a
wallet do pool.

1. Chave de API gratuita: [breez.technology](https://breez.technology) →
   formulário "Request API Key"
2. `cd frontend && npm install` (já inclui `@breeztech/breez-sdk-spark`)
3. No `.env` do frontend (`frontend/.env`, não o da raiz):
   ```bash
   VITE_BREEZ_API_KEY=sua_chave_aqui
   ```
4. Teste isolado (sem precisar da UI):
   ```bash
   cd frontend
   VITE_BREEZ_API_KEY=sua_chave npx tsx scripts/test-breez-wallet.ts
   ```

A seed da carteira Breez deriva dos mesmos bytes do `nsec` da identidade
Nostr da usuária (`src/lib/breez-wallet.ts::mnemonicFromNsecBytes`) — não é
NIP-06 (abandonado, ver `src/lib/nostr-keys.ts`), é uma reinterpretação
determinística da mesma chave mestra em formato BIP-39, só porque o SDK
exige mnemonic como entrada.

⚠️ Módulo escrito com base na família de SDKs Breez (Liquid/Spark
compartilham desenho); a versão Spark é recente — confira o autocomplete do
TypeScript contra a versão instalada antes de confiar cegamente nos nomes
exatos de método em `receberPagamento`/`prepararEnvio`.

---

## Demo em modo mock (zero credenciais reais)

Pra rodar a demo pros avaliadores (ou qualquer teste) com **zero risco** de
tocar em dinheiro/conta real, use a flag `--mock` do `dev-up.sh`:

```bash
bash scripts/dev-up.sh --mock
```

O script faz tudo automaticamente:

1. **Salva** seu `.env` real em `.env.real.bak`
2. **Copia** `.env.mock` para `.env` (todas as credenciais vazias → mock)
3. **Roda o seed** (reseta DB + cria FUNDADORA + FORNECEDORA + 9 trilhas/54 aulas)
4. **Sobe** backend (:8000) + frontend (:5173)
5. Ao pressionar **Ctrl+C**: mata os servidores e **restaura** o `.env` real

Todo campo em `.env.mock` é vazio de propósito — LNbits, Coinos, Pix,
Binance e custódia caem em mock sozinhos. Nenhuma chamada externa é feita.
Nunca sobrescreva o `.env.mock` com suas credenciais reais.

> **Importante:** o `.env.mock` é gitignored (igual `.env`). Ele é
> compartilhado com o time só como referência — cada máquina tem o seu.

### Credenciais demo

| Usuária      | Identificador  | PIN  | Tier | Notas                                  |
|--------------|----------------|------|------|----------------------------------------|
| Fundadora    | `FUNDADORA`    | 1234 | 3    | Mestra, npub via /demo-setup           |
| Fornecedora  | `FORNECEDORA`  | 1234 | 3    | Mestra, ponto de troca para testes     |
| Convidada    | (criada na demo) | —  | 1    | Nasce pelo link `/convite/FUNDADORA_INVITE` |

### Roteiro da demo (passo a passo, ~10 min)

#### Cena 1 — O disfarce (2 min)
1. Abrir `http://localhost:5173` — catálogo de trilhas de crochê
2. Navegar pelas 9 trilhas (Ponto Baixo, Ponto Alto, Ponto Renascido...)
3. Abrir uma trilha qualquer → ver aulas e materiais
4. **Ponto chave:** nenhuma menção a dinheiro, cripto, empréstimo

#### Cena 2 — O portal (2 min)
1. Abrir a trilha 9 ("Ponto Renascido") → nível 1 → aula 1
2. A aula não tem conteúdo — mostra um canvas para desenhar um padrão
3. Desenhar o Ponto Arakne (padrão correto) → destrava a camada financeira
4. **Ponto chave:** o gesto oculto revela o microcrédito

#### Cena 3 — A FinancialPage (2 min)
1. Após destravar, ver a FinancialPage ("Seu ateliê"):
   - Card de nível (tier) e saldo devedor ("padrão em andamento")
   - Cesta de novelos (carteira) com saldo e cotação
   - Botões: Entregar novelos, Receber novelos, Devolver novelos
   - Fornecedoras de Linha (pontos de troca)
   - Tecelã de confiança (avalista de recuperação)
2. **Ponto chave:** tudo em vocabulário crochê — "novelos", "fios", "ateliê"

#### Cena 4 — Solicitar microcrédito (1 min)
1. Na FinancialPage, clicar em "Puxar novelos"
2. Informar valor em sats → cria empréstimo (mock Lightning)
3. Ver saldo devedor aumentar + empréstimo na lista

#### Cena 5 — Repagamento via Pix (2 min)
1. Clicar em "Devolver novelos" num empréstimo
2. Escolher "Pagar com Pix" → gera QR code Pix (mock)
3. (Em mock mode, o pagamento é confirmado automaticamente)
4. Ver "Pagamento confirmado! Novelos devolvidos."
5. Ver saldo devedor zerar + tier subir

#### Cena 6 — Cesta de novelos (carteira) (1 min)
1. Na FinancialPage, ver o card "Cesta de novelos"
2. Clicar "Receber novelos" → tela de transação
3. Selecionar país (Brasil habilita pagamento)
4. Informar valor em BRL → gera QR Pix para depósito (mock)

#### Cena 7 — Recuperação de conta (2 min)
1. Sair da conta (sem apagar identidade)
2. Tela de login → "Recuperar acesso"
3. Escolher "Tenho meu PIN" → informar identificador + PIN
4. Desenhar um novo Ponto Arakne → conta recuperada
5. **Ponto chave:** recuperação por PIN sem depender de tecelãs

### Demo automatizada (verifica todo o fluxo de microcrédito)

```bash
cd backend
python run_demo.py    # <10s, mock mode
```

---



## Estrutura do repositório

```
arakne/
├── docker-compose.yml
├── AGENTS.md                    # convenções de desenvolvimento
├── Arakne-documento-mestre.md   # referência arquitetural canônica
├── config/                      # bitcoin + lnd (regtest)
├── scripts/                     # dev-up.sh, init-lightning, multisig
├── src/                         # app Nostr híbrido (React 19 + Nostrify)
├── backend/
│   ├── seed_demo.py             # reseta DB + cria FUNDADORA + FORNECEDORA
│   ├── run_demo.py              # demo end-to-end via API (<10s, mock)
│   └── app/
│       ├── main.py              # FastAPI app + create_all() + drift safety
│       ├── models/              # 18 modelos (Usuaria, Sessao, Emprestimo,
│       │                        #   Aval, Troca, Trilha, Aula, Material,
│       │                        #   ProgressoAula, AvalistaRecuperacao,
│       │                        #   RecoveryShareBackup, PagamentoPix,
│       │                        #   CustodiaMultisig, ConversaoPool,
│       │                        #   TransacaoCarteira, ...)
│       ├── routers/             # 10 routers (health, auth, usuarias,
│       │                        #   avais, emprestimos, pontos_troca,
│       │                        #   trilhas, pix, carteira, custodia)
│       ├── schemas/             # Pydantic schemas
│       ├── services/            # risco, lnbits, bech32, pix, exchange
│       └── tests/               # pytest (135 testes)
└── frontend/
    ├── package.json
    └── src/
        ├── App.tsx              # máquina de estados (23 views, sem React Router)
        ├── api.ts               # cliente API + localStorage keys
        ├── styles.css           # tipografia Cinzel + Fraunces + Inter
        ├── components/           # RecoveryBell, RecoveryQRGenerator,
        │                        #   RecoveryScanner, MeuCodigoQR, Header
        ├── hooks/               # useRecoveryListener, useRecoveryBellData
        ├── lib/                 # ssss, recovery-*, gift-wrap, pattern-crypto
        ├── pages/
        │   ├── onboarding/      # Splash, CreateAccount, RecoverAccount,
        │   │                    #   RecoverySetup, RecoveryHelpRequest
        │   ├── FinancialPage.tsx    # camada financeira (cesta, troca, QR, tecelã)
        │   ├── CarteiraTransacaoPage.tsx  # transações (entregar/receber/devolver)
        │   ├── PerfilPage.tsx       # bancada (nível/tier, reserva do ateliê)
        │   ├── ExtratoPage.tsx      # registro de padrões (extrato)
        │   ├── TrilhasPage.tsx      # catálogo disfarce
        │   └── ...
        └── types.ts
```

---

## Modelo de dados

| Tabela                  | Campos principais                                                              |
|-------------------------|--------------------------------------------------------------------------------|
| **Usuaria**             | id, identificador, pin_hash, apelido, npub, pais, lnbits_wallet_key, codigo_indicacao, codigo_indicacao_usado, tier (0-3), saldo_devedor, tier_congelado, avalista_id (FK self), disponivel_como_ponto, trocas_como_ponto_concluidas, padroes_completos, criado_em |
| **Sessao**              | id, usuaria_id, token, criada_em, expira_em                                     |
| **Emprestimo**          | id, usuaria_id, valor_sats, invoice_id, status, criado_em, quitado_em           |
| **Aval**                | usuaria_que_avaliza_id, nova_usuaria_id, criado_em                              |
| **Troca**               | id, solicitante_id, ponto_id, valor_sats, status, criado_em, confirmada_em     |
| **Trilha / Aula / Material** | trilha_id, nivel, ordem, aula_id, material_id, url, ...                  |
| **ProgressoAula**       | usuaria_id, aula_id, concluida, concluida_em, inscrita_em                      |
| **AvalistaRecuperacao** | usuaria_id, npub_avaliadora, ordem, is_shadow, criado_em                        |
| **RecoveryShareBackup** | usuaria_id (unique), encrypted_share_blob, criado_em                            |
| **PagamentoPix**        | id, emprestimo_id, txid, mp_payment_id, status, valor_sats, valor_centavos_brl, criado_em, confirmado_em |
| **CustodiaMultisig**    | id, descriptor, endereco, quorum, total_signatarios, network, ativo, criado_em |
| **ConversaoPool**       | id, pagamento_pix_id, valor_centavos_brl, quantidade_btc, status, erro, criado_em |
| **TransacaoCarteira**   | id, usuaria_id, tipo, valor_sats, valor_centavos_brl, cotacao_btc_brl, descricao, contraparte, status, criado_em |

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

## Demo do júri — roteiro completo

### Preparação (1x)

```bash
bash scripts/dev-up.sh --all
```

Isso sobe backend (:8000) + frontend (:5173), reseta o DB com dados demo
(FUNDADORA + FORNECEDORA + 9 trilhas/54 aulas/127 materiais) e registra
a custódia multisig demo.

### Como rodar a demo em modo mock (`--mock`)

Pra demonstrar o fluxo inteiro sem tocar nas credenciais reais (Mercado
Pago, LNbits, Binance) e sem depender de internet no dia da apresentação:

```bash
bash scripts/dev-up.sh --mock
```

O script faz tudo automaticamente:

1. **Salva** seu `.env` real em `.env.real.bak`
2. **Copia** `.env.mock` para `.env` (todas as credenciais vazias → modo mock)
3. **Roda o seed** (reseta o DB + cria FUNDADORA + FORNECEDORA + 9 trilhas)
4. **Sobe** backend (`:8000`) + frontend (`:5173`)
5. Ao pressionar **Ctrl+C**: mata os servidores e **restaura** o `.env` real

Em modo mock, QR Pix são fake, invoices são simuladas, e **nenhuma chamada
real** sai pro Mercado Pago, LNbits ou Binance — seu `.env` real fica
intacto o tempo todo.

**Credenciais demo:**

| Conta       | Identificador | PIN  | Tier |
|-------------|----------------|------|------|
| Fundadora   | `FUNDADORA`    | 1234 | 3    |
| Fornecedora | `FORNECEDORA`  | 1234 | 3    |

**Roteiro da demo:**

1. Abrir `http://localhost:5173/demo-setup` → conectar como FUNDADORA (já preenchido)
2. Ir à trilha 9 → desenhar o Ponto Arakne → revela a FinancialPage
3. Abrir `http://localhost:5173/convite/FUNDADORA_INVITE` **num navegador
   diferente ou numa aba anônima/privada** → cria a convidada (tier 1).
   > ⚠️ Não abra num aba normal do mesmo navegador: como o app guarda a
   > sessão/PIN no `localStorage`, uma segunda aba comum do mesmo navegador
   > compartilha a mesma identidade logada — pra ver as duas usuárias
   > (FUNDADORA e a convidada) ao mesmo tempo, elas precisam estar em
   > perfis de navegador isolados (janela anônima, outro navegador, ou
   > outro perfil).
4. Na FinancialPage: "Puxar novelos" (empréstimo mock), "Devolver"
   (repagamento mock), troca de pontos

### Dados de seed

| Usuária      | Identificador  | PIN  | Tier | Notas                                  |
|--------------|----------------|------|------|----------------------------------------|
| Fundadora    | `FUNDADORA`    | 1234 | 3    | Mestra, npub via /demo-setup           |
| Fornecedora  | `FORNECEDORA`  | 1234 | 3    | Mestra, ponto de troca para testes     |
| Convidada    | (criada na demo) | —  | 1    | Nasce pelo link `/convite/FUNDADORA_INVITE` |

### Roteiro passo a passo (~10 min)

#### Cena 1 — O disfarce (2 min)
1. Abrir `http://localhost:5173` — catálogo de trilhas de crochê
2. Navegar pelas 9 trilhas (Ponto Baixo, Ponto Alto, Ponto Renascido...)
3. Abrir uma trilha qualquer → ver aulas e materiais
4. **Ponto chave:** nenhuma menção a dinheiro, cripto, empréstimo

#### Cena 2 — O portal (2 min)
1. Abrir a trilha 9 ("Ponto Renascido") → nível 1 → aula 1
2. A aula não tem conteúdo — mostra um canvas para desenhar um padrão
3. Desenhar o Ponto Arakne (padrão correto) → destrava a camada financeira
4. **Ponto chave:** o gesto oculto revela o microcrédito

#### Cena 3 — A FinancialPage (2 min)
1. Após destravar, ver a FinancialPage ("Seu ateliê"):
   - Card de nível (tier) e saldo devedor ("padrão em andamento")
   - Cesta de novelos (carteira) com saldo e cotação
   - Botões: Entregar novelos, Receber novelos, Devolver novelos
   - Fornecedoras de Linha (pontos de troca)
   - Tecelã de confiança (avalista de recuperação)
2. **Ponto chave:** tudo em vocabulário crochê — "novelos", "fios", "ateliê"

#### Cena 4 — Solicitar microcrédito (1 min)
1. Na FinancialPage, clicar em "Puxar novelos"
2. Informar valor em sats → cria empréstimo (mock Lightning)
3. Ver saldo devedor aumentar + empréstimo na lista

#### Cena 5 — Repagamento via Pix (2 min)
1. Clicar em "Devolver novelos" num empréstimo
2. Escolher "Pagar com Pix" → gera QR code Pix
3. (Em mock mode, o webhook aprova automaticamente em ~3s)
4. Ver "Pagamento confirmado! Novelos devolvidos."
5. Ver saldo devedor zerar + tier subir

#### Cena 6 — Cesta de novelos (carteira) (1 min)
1. Na FinancialPage, ver o card "Cesta de novelos"
2. Clicar "Receber novelos" → tela de transação
3. Selecionar país (Brasil habilita pagamento)
4. Informar valor em BRL → gera QR Pix para depósito

#### Cena 7 — Recuperação social (2 min)
1. Sair da conta (sem apagar identidade)
2. Tela de login → "Recuperar acesso"
3. Escolher "Pedir aula de ponto a uma tecelã"
4. Informar identificador → ver tecelãs vinculadas (com apelido)
5. Pedir ajuda → "Aguardando resposta da tecelã"
6. (Em outra conta, a tecelã vê o sino 🎀 e responde)
7. Escanear QR da tecelã → combinar shares → recuperar conta

### Roteiro automatizado (verifica todo o fluxo de microcrédito)

```bash
cd backend
python run_demo.py    # <10s, mock mode
```

---

## Notas de segurança

- A tela inicial é um catálogo de padrões de crochê — **nenhum símbolo cripto** visível.
- Notificações usam linguagem têxtil ("novo padrão disponível", "aula de ponto").
- O gesto de desenhar o Ponto Arakne revela a tela financeira.
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
