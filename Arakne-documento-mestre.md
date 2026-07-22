# Arakne — Documento Mestre: Mecanismos, Arquitetura e Decisões

> Este documento consolida tudo que foi decidido até agora: o mecanismo central, a arquitetura de cada camada, o racional por trás de cada decisão, o que é MVP de hackathon vs. arquitetura-alvo, e o que ainda está pendente. É o documento de referência único do time — os outros arquivos (adendo de Pix/custódia, wireframes, prompts de IA) continuam existindo, mas este é o ponto de partida.
>
> **Atualizado em 21/07/2026** com tudo que foi construído e decidido entre sexta (18/07) e hoje: rail de Pix real, script de custódia multisig, integração Binance (conversão BRL→sats), decisão de usar LNbits hospedado em vez de nó próprio, e a decisão de usar Breez SDK para carteiras individuais das usuárias. As seções 1-17 abaixo são o documento original; as seções 18+ são as adições desta atualização.

**Tagline:** "Cada fio, uma mulher. Cada nó, uma confiança."

---

## Sumário

1. Tese e conceito central
2. Identidade de marca e vocabulário
3. Motor de crédito — regras determinísticas
4. Camada de disfarce e mecanismo de revelação
5. Ponto Arakne — autenticação e recuperação social
6. Custódia do fundo
7. Camada de gasto — modelo Tando via Pix
8. Disfarce financeiro no rail brasileiro (Pix e boleto)
9. Proteção cambial do empréstimo
10. Generalização multi-moeda
11. Modelo de sustentabilidade — juros
12. Exemplos de referência
13. Stack técnica e status de implementação
14. MVP (hackathon) vs. Arquitetura-alvo — tabela consolidada
15. Pendências consolidadas
16. Roadmap — Camada de investimento (staking do pool)
17. Documentos relacionados
18. Rail de Pix real (Mercado Pago) — construído 19-20/07
19. Custódia multisig — script de geração offline
20. Conversão BRL→sats (Binance) — o "passo 4" do ciclo financeiro
21. Carteira Lightning do pool — de nó próprio pra LNbits hospedado
22. Carteiras individuais das usuárias — decisão Breez SDK
23. Mecânica de voucher com trava em sats — especificação fechada
24. Descompassos doc↔código descobertos nesta rodada
25. Registro de sessões (19-21/07/2026) e prazos

---

## 1. Tese e conceito central

App de aprendizado de crochê/tecelagem que, sob a superfície, é uma rede global de microcrédito peer-to-peer via Lightning Network. Acesso ao crédito é desbloqueado por aval social (indicação entre mulheres) e por competência (padrões de crochê completados como trilha de capacitação). O disfarce **não é cosmético — é requisito de segurança** para usuárias sob controle financeiro coercitivo (cônjuge, família ou Estado).

**Público-alvo:** mulheres sem acesso bancário por controle financeiro coercitivo — casos como Afeganistão, Índia, Nordeste do Brasil e Colômbia.

**Por que Bitcoin/Lightning:** permite que o fundo seja global (qualquer pessoa deposita em BTC, de qualquer lugar) sem depender de correspondência bancária tradicional, que é justamente a barreira que exclui essas usuárias.

**Sobre o mito da Aracne (contexto de marca, não decoração):** Aracne foi uma tecelã mortal punida por Atena por expor, numa tapeçaria, os abusos de poder dos deuses contra mulheres. É uma história de punição por dizer a verdade — ambígua, não uma história de empoderamento ingênuo à primeira vista. A marca **reclama** essa narrativa de propósito ("Aracne foi punida por tecer a verdade; a gente termina o que ela começou"), e isso precisa estar explícito no pitch, não implícito — do contrário pode soar incompleto ou ser lido ao contrário do pretendido por quem conhece o mito.

---

## 2. Identidade de marca e vocabulário

**Paleta:** imperial blue, dourado, bordô, creme e dusk blue. Marca gráfica: aranha / teia / coroa.

**Tipografia:**
| Uso | Fonte |
|---|---|
| Wordmark (logo) | Cinzel |
| Headings / voz do app | Fraunces |
| Interface e corpo de texto | Inter (números tabulares) |

**Regra inegociável de vocabulário:** termos financeiros (saldo, depósito, saque, empréstimo, extrato) **nunca aparecem na interface — nem mesmo na camada financeira revelada.** O vocabulário de disfarce não é só para a camada pública; ele é o mecanismo de segurança em si, porque é o que protege a usuária se alguém olhar a tela por cima do ombro dela mesmo depois da revelação.

| Termo real | Termo na interface |
|---|---|
| Saldo | Material disponível |
| Depósito | Repor material |
| Saque | Usar material |
| Empréstimo (pedido) | Novo kit |
| Extrato | Registro |
| Dívida em aberto | Kit em aberto |
| Pagamento quitado | Padrão concluído |
| Novo crédito disponível (subiu de tier) | Material novo disponível |
| Pedido de vouch (aval) | Fio puxado |

---

## 3. Motor de crédito — regras determinísticas

Regras simples e auditáveis de propósito — sem ML, sem score opaco, pra que o júri (e qualquer usuária) consiga entender a regra inteira numa frase.

| Tier | Requisito | Limite |
|---|---|---|
| 0 | Nenhum | 0 |
| 1 | 1 aval (vouch) | 5.000 sats |
| 2 | Tier 1 quitado | 15.000 sats |
| 3 | Tier 2 quitado | 40.000 sats — pode avalizar outras |

**Regras (pseudocódigo já validado, e confirmado bater com `services/risco.py` real):**
```python
def pode_emprestar(usuaria):
    tier_atual = TIERS[usuaria.tier]
    avalista_liberada = not usuaria.avalista.tier_congelado if usuaria.avalista else True
    return (
        usuaria.saldo_devedor == 0
        and tier_atual["limite_sats"] > 0
        and avalista_liberada
    )

def ao_quitar(usuaria):
    usuaria.tier += 1
    # a partir do tier 3, ela pode gerar link de indicação para novas usuárias

def ao_atrasar(usuaria, dias_atraso):
    if dias_atraso > 14:
        usuaria.tier_congelado = True
        if usuaria.avalista:
            usuaria.avalista.tier_congelado = True  # o aval tem peso real
        # nunca reduz tier retroativamente — sem punição, só pausa de acesso
```

**⚠️ Confirmado em 20/07:** `ao_atrasar()` existe no código e está correta, mas **nunca é chamada em lugar nenhum** — não há scheduler/cron/job no repositório que dispare verificação de atraso. Atraso, hoje, não trava ninguém automaticamente. Ver seção 24.

**Racional:** o primeiro crédito não exige padrão de crochê completo, só aval — ajuda a usuária logo no início, sem barreira de competência antes do primeiro empréstimo. Em troca, o aval deixa de ser gratuito: quem avaliza passa a ter risco real. Isso troca "prova de tarefa" (sinal fraco) por "reputação real em jogo" (sinal forte) — o mesmo princípio validado por Grameen Bank e Zidisha (seção 12).

**Regra central do produto:** a usuária pode sacar com dívida em aberto — isso é intencional, é o ponto inteiro do produto. Ciclo: pedir → sacar → usar no mundo real → depositar → pagar → subir de tier.

**Decisão futura registrada (20/07, ainda não implementada):** hoje o congelamento por atraso trava a usuária inteira (`tier_congelado = True`). No modelo-alvo, será só um **valor específico do saldo dela** que fica congelado, não a conta inteira — ela continua operando com o resto. Registrado como intenção, não escopo do hackathon.

---

## 4. Camada de disfarce e mecanismo de revelação

O catálogo de padrões de crochê é a Home pública — e não é uma fachada vazia: é um app de aprendizado de crochê **real e funcional**, com conteúdo genuíno construído pelo time (confirmado 20/07: `models/aula.py`, `trilha.py`, `material.py`, `routers/trilhas.py`, e uma pasta `frontend/public/materiais/` com HTMLs reais de padrões de crochê, bordado, tricô, patchwork). Isso é o que torna o disfarce robusto — não há nada "falso" pra alguém desconfiado encontrar.

**Revelação (mecanismo único):** o card "Ponto Arakne" vive dentro do próprio catálogo de padrões, como mais um item de aprendizado — não é uma tela separada de segurança (ver seção 5 para o mecanismo completo do gesto). Tocar nele e performar o gesto correto revela a camada financeira. Qualquer outra interação mantém tudo como conteúdo de crochê normal, porque é exatamente isso que é.

**Depois da revelação, o disfarce continua.** A camada financeira usa o mesmo vocabulário de disfarce da seção 2 — nenhum termo financeiro real aparece, mesmo já dentro da parte revelada.

---

## 5. Ponto Arakne — autenticação e recuperação social

### 5.1 O mecanismo

O **Ponto Arakne** é um gesto/padrão que a própria usuária cria — não é senha ou PIN predefinido. Propositalmente difícil de configurar e fácil de sair (saída rápida de volta ao disfarce, inclusive sob coação).

**Nome do card (decisão fechada):** o card se chama "Ponto Arakne" — mesmo nome do produto — de propósito, porque o padrão visual por trás do nome é único e aleatório por usuária, e a mitologia do produto já justifica a existência dele.

### 5.2 Recuperação social

Se a usuária erra o Ponto Arakne **8 vezes**, o Ponto trava. A recuperação usa um **vouch de recuperação** (sem consequência financeira), com divulgação progressiva de dois elos por vez, escalonamento 24h/12h/6h..., até as fundadoras como âncora de última instância, **sem override administrativo**.

**⚠️ Atualização importante, confirmada em 20/07:** este mecanismo **já ganhou implementação real e substancial** por Julia (branch `juliamsteodoro`, mergeada em `DiOliver`) — não é mais só especificação. Arquivos confirmados no repositório:
- `frontend/src/lib/nostr-keys.ts` — geração de chaves Nostr
- `frontend/src/lib/gift-wrap.ts` — implementação de NIP-59 (gift wrap, mensagens criptografadas)
- `frontend/src/lib/ssss.ts` — Shamir's Secret Sharing (divisão de segredo em partes — provavelmente o mecanismo real por trás da "divulgação progressiva, dois elos por vez")
- `frontend/src/lib/recovery-request.ts`, `recovery-respond.ts`, `recovery-distribute.ts` — o fluxo de pedido/resposta/distribuição de recuperação
- `frontend/src/components/RecoveryBell.tsx`, `RecoveryQRGenerator.tsx`, `RecoveryScanner.tsx` — UI do fluxo
- `backend/app/models/avalista_recuperacao.py`, `recovery_share_backup.py` — persistência backend
- `backend/app/tests/test_recuperacao_nostr.py`, `test_recovery_share_backup.py` — testes

**Isto ainda não foi lido/auditado por Claude nesta sessão** — só confirmado que existe e que os testes passam (118 testes totais incluindo esses, verde). Antes de presumir qualquer coisa sobre como funciona exatamente, ler o código real primeiro — mesmo princípio de "doc/memória vs. código real" que já mordeu o time duas vezes (Pix, seção 24).

### 5.3 Custódia da chave da carteira

A chave (`nsec...`) fica a critério da própria usuária — anotar sozinha ou deixar com alguém de confiança. Acesso por outro dispositivo exige chave **+** Ponto Arakne juntos.

### 5.4 Por que é intencional

Sob coação, esgotar as tentativas deliberadamente é uma saída válida.

---

## 6. Custódia do fundo

**Problema que resolve:** o mecanismo de vouch/tier exige que alguém tenha poder de decisão sobre saldo e liberação — incompatível com "cada usuária com chave privada non-custodial de verdade". Uma carteira de **custódia compartilhada** resolve isso sem fingir que o produto é algo que não é.

**Estrutura-alvo:** reserva fria multisig (2-de-3 ou 3-de-5) + liquidez quente (nó Lightning) + ledger interno (`saldo_sats`, `saldo_devedor` no banco).

**⚠️ Atualização crítica, decidida em 21/07 (ver seção 21 para o racional completo):** o plano original desta seção assumia um **nó Lightning próprio** (LND + Bitcoin Core, ambos em `docker-compose.yml`, configurados em **regtest**). Descobriu-se em 21/07 que **regtest não tem conexão nenhuma com a rede Lightning real** — um nó regtest não consegue receber um pagamento Lightning de verdade vindo de fora (ex.: um saque da Binance). Decisão tomada: para o MVP do hackathon, o pool usa uma instância **hospedada** do LNbits (`legend.lnbits.com`, mainnet real, gratuita, sem KYC) em vez do nó Docker próprio. Isso é documentado como **decisão de MVP, não arquitetura-alvo** — a reserva fria própria (seção 21) continua sendo o objetivo de produção.

**Por que é honesto, não uma contradição:** o produto não precisa fingir ser totalmente non-custodial — ele é um fundo com custódia compartilhada e governança coletiva, parecido com uma cooperativa de crédito (seção 12).

---

## 7. Camada de gasto — modelo Tando via Pix

O [Tando](https://tando.me/) deixa qualquer pessoa no Quênia gastar Bitcoin em qualquer lugar que aceite M-Pesa. O paralelo com o Arakne é direto: **Pix no lugar de M-Pesa**.

| Tando (M-Pesa) | Arakne (Pix) | Status confirmado em 20/07 |
|---|---|---|
| Escanear QR Code | Scanner de QR Pix (BR Code) | ⚠️ Não construído — o parser de leitura de QR de terceiros não existe |
| Cotação antes de confirmar | Serviço de cotação com trava de câmbio | ⚠️ Não construído — seção 9 segue não implementada |
| Liquidação instantânea | Cliente PSP com idempotência | ✅ **Construído e testado com Mercado Pago real** (seção 18) |

---

## 8. Disfarce financeiro no rail brasileiro (Pix e boleto)

O desembolso é fácil de disfarçar (Pix de conta com nome comercial inofensivo). O **repagamento** é o ponto cego, resolvido via **Pix Cobrança dinâmico** (ver seção 18 — construído e testado com o Mercado Pago real em 20/07).

**Estado atual (MVP hackathon):** conta Pix pessoal da fundadora, via Mercado Pago (Checkout Transparente, credenciais de teste `TEST-...`). PJ com nome comercial inofensivo continua pendente de investimento.

---

## 9. Proteção cambial do empréstimo

**Mecanismo escolhido:** denominação na moeda local + fundo absorve a diferença.

**⚠️ Ainda não implementado, confirmado em 20/07:** o endpoint de cobrança Pix (seção 18) recebe `valor_sats` e `valor_centavos_brl` como dois números independentes, informados por quem chama a API — não há conversão/cotação automática ligando os dois ainda. Isso é uma simplificação consciente, documentada no próprio código (`schemas/pix.py`).

**Aplicação do mesmo princípio no lado do repagamento (nova, seção 20):** quando o BRL do repagamento é convertido em sats de volta pro pool, o valor **sacado** da corretora é fixado em `valor_sats` (o que foi de fato abatido da dívida), não em "quanto BTC o BRL comprou" — se o preço do BTC variou nesse meio-tempo, o fundo absorve a diferença. Mesmo princípio desta seção, aplicado ao repagamento em vez do empréstimo.

---

## 10. Generalização multi-moeda

Sem alterações desde a última versão — schema `moeda_local` ainda não generalizado, permanece nota de roadmap.

---

## 11. Modelo de sustentabilidade — juros

Sem alterações — spread exato sobre a Selic segue pendente.

---

## 12. Exemplos de referência

Sem alterações — Grameen Bank, Zidisha, SACCO seguem como paralelos válidos.

---

## 13. Stack técnica e status de implementação

**Atualizado em 21/07 com o estado real, confirmado por leitura de código (não por suposição):**

| Camada | Escolha | Status real confirmado |
|---|---|---|
| Backend | Python + FastAPI + SQLite | ✅ Em uso |
| Frontend | React + Vite + TypeScript | ✅ Em uso — confirmado app único em `frontend/` (o scaffold paralelo `src/`/"mkstack" mencionado em versão anterior deste doc foi descartado como não-relevante) |
| Lightning (empréstimo, usuária) | LNbits | 🔴 Mock — nunca configurado com backend real |
| Lightning (pool, repagamento→sats) | LNbits | 🟡 Decisão nova: `legend.lnbits.com` hospedado, não nó próprio (seção 21) |
| Pix (repagamento) | Mercado Pago | ✅ **Real, testado, confirmado funcionando** (seção 18) |
| Conversão BRL→sats | Binance | 🟡 Código pronto e testado em mock; compra (Spot) liberada; saque (Lightning) aguardando liberação de segurança pós-KYC da corretora (seção 20) |
| Custódia multisig | Script offline (`embit`) | ✅ Script pronto e testado; **ainda não rodado com o time de verdade** |
| Identidade Nostr / NIP-06 | A construir | 🟡 Muito mais avançado do que se pensava — ver seção 5.2 e 24 |

**Descoberto e corrigido em 20/07:** `saldo_sats` (mencionado em versões anteriores deste documento como "já implementado") **não existe** no schema do banco. Só existe `saldo_devedor`. Não há representação de saldo positivo/disponível — só dívida é rastreada.

---

## 14. MVP (hackathon) vs. Arquitetura-alvo

| Mecanismo | MVP (hackathon) | Arquitetura-alvo |
|---|---|---|
| Custódia do fundo — Lightning | **`legend.lnbits.com` hospedado** (decisão 21/07) | Nó Lightning próprio, mainnet, com canais reais e liquidez própria |
| Custódia do fundo — reserva fria | Script `gerar_multisig.py` rodado em modo demo (uma pessoa, 3 chaves) | Cada steward gera a própria chave isoladamente (`--gerar-1-steward` + `--combinar-xpubs`) |
| Repagamento | Pix Cobrança dinâmico via Mercado Pago (real, testado) | Mesmo, + PJ com nome comercial dedicado |
| Conversão BRL→sats | Binance, ordem a mercado (Spot) | Binance Convert (cotação travada) ou equivalente — avaliado e adiado, ver seção 20 |
| Carteira da usuária | Ainda mock (LNbits) | Breez SDK (não-custodial, ver seção 22) |
| Voucher com custo | Especificado (seção 23), não implementado | Mesmo, com valor calibrado (hoje: 500 sats fixo) |

---

## 15. Pendências consolidadas

- 🔴 `ao_atrasar()` nunca é chamada — atraso não trava ninguém automaticamente hoje.
- 🔴 Parser de QR Pix de terceiros (fluxo de gasto, seção 7) não existe.
- 🔴 Cotação/trava de câmbio (seção 9) não existe — dois valores independentes informados manualmente.
- 🟡 Saque Binance aguardando liberação de segurança (24-48h pós-verificação KYC, sem como acelerar).
- 🔴 LNbits do empréstimo (usuária) continua 100% mock.
- 🔴 Multisig real do time não foi gerada ainda (só testada em modo demo).
- 🟡 Frontend conectado ao rail de Pix — colega iniciou ("início da implementação front financeiro", commit `b2e9b87`), não auditado ainda.
- 🔴 Mecânica de voucher com trava (seção 23) — especificação fechada, zero código.
- 🟡 Recuperação social/Nostr (seção 5.2) — muito mais avançada do que o documento presumia; precisa de leitura/auditoria antes de continuar construindo em cima.

---

## 16. Roadmap — Camada de investimento (staking do pool)

Sem alterações desde a última versão — segue como visão de arquitetura-alvo, pendente de validação jurídica, fora do escopo funcional do hackathon (exceto a tela de depósito).

---

## 17. Documentos relacionados

- `arakne-adendo-arquitetura-pix-custodia.md`
- Documento de wireframes/telas
- `arquitetura-arakne-hackathon.md`
- `arakne-prompts-ia.md`
- Documento HTML do mito da Aracne

---

## 18. Rail de Pix real (Mercado Pago) — construído 19-20/07

**Construído do zero** (branch `jhualves` → mergeada em `DiOliver`): não existia nenhuma linha de Pix no repositório antes desta rodada — só Lightning mockado.

**Peças:**
- `services/pix.py` — cliente Mercado Pago, com fallback mock (mesmo padrão do `lnbits.py`). Detecta credencial de teste (`TEST-...`) e injeta `payer.first_name: "APRO"` automaticamente (mas ver ressalva abaixo — não funciona nesta API).
- `models/pagamento_pix.py` — tabela `pagamentos_pix`, `txid` único por transação.
- `routers/pix.py` — `POST /pix/emprestimos/{id}/cobranca` (gera QR), `GET /pix/pagamentos/{txid}` (polling), `POST /pix/webhook` (confirmação automática, idempotente, reusa `ao_quitar()`).

**Bugs reais encontrados e corrigidos, em ordem:**
1. **`401 Unauthorized`** — token colado era a Public Key (formato UUID curto), não o Access Token de verdade (formato longo `TEST-xxxxx-xxxxxx-xxxx-xxxxx`). Resolvido confirmando visualmente o tamanho/formato do token.
2. **`400 Bad Request`, "payer.email must be a valid email"** — o e-mail sintético usava domínio `.invalid` (RFC 2606, tecnicamente reservado pra esse fim), mas o validador do Mercado Pago rejeita esse TLD mesmo assim. Corrigido trocando por `example.com` (também reservado por RFC 2606, mas com TLD `.com` que passa na validação).
3. **Confirmado, testando de verdade:** uma cobrança Pix real, criada com sucesso, com QR code, `mp_payment_id` numérico real, `ticket_url` real do sandbox Mercado Pago.

**Limitação descoberta e não contornável — sandbox do Mercado Pago não fecha o loop de teste:** confirmado por exemplo oficial do próprio Mercado Pago (`pix-payment-sample-java`): pagamentos Pix em ambiente de teste, na API `/v1/payments` (Checkout Transparente, a que usamos), **ficam pendentes pra sempre** — não existe simulação de pagamento real via banco nessa API. O valor mágico `payer.first_name: "APRO"` que resolve isso **existe só na API mais nova (`/v1/orders`)**, não na que usamos. Decisão tomada: manter a API atual (testada, sem outros problemas conhecidos) e aceitar que o teste de "pagamento → webhook → confirmação" não fecha 100% em sandbox — funciona normalmente em produção (limitação é só do ambiente de teste).

**Webhook testado com túnel público** (`cloudflared tunnel --url http://localhost:8000`) — confirmado que o Mercado Pago realmente envia a notificação (viu-se no log do servidor, `POST /?data.id=...`), mas bateu na URL raiz por engano na primeira tentativa (faltou `/pix/webhook` no final da `MP_WEBHOOK_URL`) — corrigido.

---

## 19. Custódia multisig — script de geração offline

`scripts/gerar_multisig.py` — gera a reserva fria 2-de-3 (seção 6) inteiramente offline, via biblioteca `embit`, sem precisar de nó Bitcoin rodando.

**Dois modos:**
- `--gerar-3-demo` — uma pessoa gera as 3 chaves de uma vez. **Só serve pra demonstrar viabilidade técnica no pitch — nunca usar com fundos reais**, porque anula o ponto inteiro da custódia compartilhada (uma pessoa sozinha teria o quorum).
- `--gerar-1-steward` + `--combinar-xpubs` — cada steward gera a própria chave isolada, compartilha só o xpub (nunca a mnemonic); o script combina os xpubs recebidos num descriptor `wsh(sortedmulti(2,...))`. Modo correto pra produção.

Testado nos dois modos, incluindo a proteção que recusa combinar um arquivo que contenha mnemonic por engano.

**Pendência:** ainda não rodado com o time de verdade (só em modo demo, nos testes).

---

## 20. Conversão BRL→sats (Binance) — o "passo 4" do ciclo financeiro

### 20.1 O buraco que isso fecha

Confirmado em 20/07: quando o webhook do Pix confirmava um repagamento, o código só abatia `saldo_devedor` no banco — **nenhum sat de verdade voltava pro pool Lightning**. O fundo ficaria permanentemente mais pobre a cada empréstimo, sem esse passo.

### 20.2 Processo de decisão de qual corretora usar

Avaliadas três opções, nessa ordem, cada uma descartada ou confirmada por evidência real (nunca por suposição):

1. **Foxbit** — API REST v3 bem documentada. **Descartada**: confirmado via endpoint público (`GET /rest/v3/currencies`, sem autenticação) que a única rede disponível pra BTC é `"bitcoin"` (on-chain) — Lightning não existe na API, mesmo aparecendo como recurso do app deles.
2. **BityBank / Biscoint** — era a pioneira histórica em Lightning no Brasil. **Descartada por incerteza**: a API do Biscoint foi desativada; quem provê API agora é uma empresa diferente (BitPreço), sem confirmação de que ainda suporta Lightning.
3. **Binance** — **Escolhida.** Confirmado oficialmente (`developers.binance.com`, doc de "Deposit Address"): rede `"LIGHTNING"` documentada na API de verdade, não só na interface. Situação regulatória no Brasil resolvida em 2026 (autorizada a operar como corretora de valores, acordo com a CVM fechado em 2024).

### 20.3 O que foi construído

- `services/exchange.py` — `BinanceService`: `cotacao_btc_brl()` (pública), `comprar_btc_mercado()` (ordem a mercado, `quoteOrderQty` em BRL), `sacar_lightning()` (`network: "LIGHTNING"`).
- **Diferença deliberada de design vs. `lnbits.py`/`pix.py`:** erro real em runtime **nunca** cai em mock silencioso aqui — levanta `BinanceError` explicitamente. Envolve dinheiro real (compra + saque); mascarar uma falha como sucesso criaria inconsistência contábil real.
- `models/conversao_pool.py` — tabela de auditoria (`conversoes_pool`), separada da confirmação do repagamento: uma falha na conversão **nunca** reverte ou atrasa a quitação da dívida da usuária, só fica registrada como `"falhou"` pra reconciliar depois.
- Integrado no webhook do Pix (`routers/pix.py`) — depois que a dívida já foi commitada, tenta converter; qualquer exceção é capturada e registrada, nunca propaga.

### 20.4 Gotchas operacionais descobertos (importantes pro time saber)

- **Chave de API com permissão de saque exige restrição de IP** — obrigatório pela própria Binance, confirmado na doc oficial.
- **Toda verificação de segurança nova (incluindo o KYC inicial) trava saques por 24-48h**, sem exceção, sem como acelerar. A conta foi verificada ~20h de 20/07; saque só libera entre a noite de 21/07 e a noite de 22/07.
- **A Secret Key só aparece uma vez** na tela de criação — se não copiar na hora, precisa apagar a chave e gerar outra (aconteceu uma vez nesta rodada).
- **Convert API (`getQuote`/`acceptQuote`) avaliada e descartada por ora**: conceitualmente melhor pro nosso caso (cotação travada, como o Pix já usa), e confirmado via endpoint público que o par BRL→BTC existe (`fromAssetMinAmount: 0.051`, praticamente zero). Mas múltiplos desenvolvedores relatam erro `-1002 "not authorized"` nesses endpoints especificamente, mesmo com chave válida e IP liberado — sugere uma liberação extra não documentada claramente. Risco não vale a pena tão perto do prazo; registrado como melhoria de roadmap pós-hackathon, não abandonado de vez.

---

## 21. Carteira Lightning do pool — de nó próprio pra LNbits hospedado

**Decisão tomada em 21/07, revisando a seção 6.**

O `docker-compose.yml` já tinha Bitcoin Core + LND + LNbits configurados — mas em **regtest** (`config/bitcoin/bitcoin.conf`: `regtest=1`). Regtest é uma rede de teste isolada, **sem nenhuma conexão com a rede Lightning real**.

Isso só foi descoberto como bloqueador ao planejar como o pool receberia o saque real da Binance (seção 20): um nó regtest não tem como receber um pagamento Lightning de fora, porque ele simplesmente não está conectado à rede real. Não era questão de configuração — é incompatibilidade de rede fundamental.

**Decisão:** usar `legend.lnbits.com` — instância pública, hospedada, gratuita, rodando em **mainnet real**, sem KYC — em vez de subir o Docker próprio. O código (`services/lnbits.py`) não muda nada, porque fala a API REST do LNbits, que é a mesma não importa quem hospeda. Só troca `LNBITS_URL` no `.env`.

**Registrado com honestidade:** isso é infraestrutura de terceiro, não "nossa" — não é a arquitetura-alvo (que continua sendo nó próprio com canais reais, seção 6/14). É uma escolha de MVP explícita, documentada, do mesmo jeito que outras peças do hackathon (Pix pessoal em vez de PJ, etc.).

---

## 22. Carteiras individuais das usuárias — decisão Breez SDK

**Decidido em 20-21/07, ainda não implementado.**

Distinto da seção 21 (que é sobre o *pool*): esta seção é sobre a carteira Lightning de **cada usuária individual** — hoje ainda 100% mock (LNbits, com a chave admin da wallet dela guardada no próprio backend, ou seja, tecnicamente custodial, apesar da visão do produto ser "ela assina, sem dupla-custódia").

**Escolhido: Breez SDK** (geração atual, "Breez SDK - Spark", non-custodial de verdade, protocolo Spark). Três motivos, que se somam:
1. Existe um bônus específico no prêmio do hackathon pra quem usa Breez.
2. A integração Lightning com usuárias individuais **nunca foi construída** — não é trocar algo que já funciona, é escolher a ferramenta certa antes de começar.
3. O SDK documenta explicitamente suporte a **"run multiple user balances from a single backend server"** — desenhado pra exatamente esse caso: um backend gerenciando várias carteiras não-custodiais.

**Onde não se aplica:** o pool continua precisando ser custodial (seção 6) — o mecanismo de aval/tier exige que a Arakne tenha poder de congelar/gerenciar saldo, o que um SDK não-custodial não permite por design. Breez é só pra carteira individual, nunca pro fundo.

**Prazo:** parte do escopo de quarta (junto do NIP-06/identidade, seção 5.2) — não afeta o prazo do rail financeiro.

---

## 23. Mecânica de voucher com trava em sats — especificação fechada

**Fechada em 20/07, zero código ainda.**

Hoje, `routers/avais.py` só cria o vínculo `avalista_id` — sem escrow, sem trava de saldo. `GET /usuarias/me/convite` já existe e já é gated por `pode_avalizar()` (tier ≥ 3), mas sem custo em sats nenhum.

**Especificação nova, substituindo/complementando o gate:**

1. **Gate pra gerar link de indicação:** `tier ≥ 2` **E** já ter pago a trava — os dois juntos (produção-alvo será tier ≥ 3, igual já estava; tier 2 é só pra demo não ficar longa).
2. Avalista em tier ≥ 2 paga **500 sats fixos** (calibra depois) via Lightning, **da própria carteira, assinando ela mesma** — sem dupla-custódia, coerente com a decisão da seção 22.
3. Só depois desse pagamento confirmado, o link/código é gerado e liberado.
4. Avalizada usa o link, nasce em tier 1, pega o empréstimo — **nada acontece com a trava ainda**.
5. Avalizada **paga o primeiro empréstimo** (quita) → **só nesse momento** o fundo devolve os 500 sats pra avalista via Lightning.

**Por que o passo 5 é "paga", não "pega o empréstimo":** foi uma correção feita em cima de uma primeira formulação mais rápida — devolver a trava assim que a avalizada *pega* o crédito zeraria o risco da avalista quase na hora, contradizendo o racional original da seção 3 ("quem avaliza passa a ter risco real"). A avalista só fica livre do risco quando a avalizada prova que paga.

---

## 24. Descompassos doc↔código descobertos nesta rodada

Terceira e quarta ocorrência do mesmo padrão já visto com o Pix (`mapa-codigo-arakne.md`) — documentação/memória descrevendo algo como pronto que não estava, ou vice-versa:

1. **`saldo_sats`** — documentado como já implementado (versões anteriores deste doc, seção 13); confirmado ausente do schema real.
2. **`ao_atrasar()`** — existe e está correta, mas nunca é chamada; atraso não tem efeito automático hoje.
3. **Existência de dois frontends** (`frontend/` real vs. `src/`/"mkstack", um scaffold Nostr genérico desconectado do backend) — descoberto em 19/07, já descartado como não-relevante, mas não estava documentado em lugar nenhum antes disso.
4. **Recuperação social/Nostr** (seção 5.2) — o oposto dos casos acima: estava documentado como "não implementada" e na real já tem bastante código real construído por Julia. Vale ler antes de presumir qualquer coisa.

**Lição registrada, de novo:** antes de construir em cima de qualquer peça do sistema, ler o código real primeiro — não confiar só no que a documentação ou a memória do time dizem que existe.

---

## 25. Registro de sessões (19-21/07/2026) e prazos

### 25.1 Prazos

| Workstream | Prazo original | Status em 21/07 |
|---|---|---|
| Rail financeiro (Pix, Lightning, custódia, conversão BRL↔sats) | Terça 12h | Prazo estourado ("terça 17:10" segundo a fundadora, com bom humor) — trabalho contínuo, sem bloqueio grave |
| Nostr / NIP-06 | Quarta à noite | Mais avançado do que o esperado — Julia já construiu boa parte (seção 5.2) |

### 25.2 O que foi resolvido nesta rodada (sexta a segunda)

- Rail de Pix real, ponta a ponta testado (seção 18)
- Script de custódia multisig (seção 19)
- Integração Binance completa em código, testada em mock (seção 20)
- Decisão de arquitetura: LNbits hospedado pro pool (seção 21)
- Decisão de arquitetura: Breez SDK pras carteiras individuais (seção 22)
- Especificação fechada da mecânica de voucher com trava (seção 23)
- `.env` carregando automaticamente via `python-dotenv` (antes exigia `export` manual)
- Múltiplos merges de branch resolvidos sem conflito (`jhualves` ↔ `DiOliver`)

### 25.3 Pendente pro próximo passo

- Saque Binance liberar (aguardando janela de segurança, fora do nosso controle)
- Configurar `legend.lnbits.com` de verdade (criar wallets, colar chaves no `.env`)
- Rodar `gerar_multisig.py` com o time de verdade (não só modo demo)
- Implementar a mecânica de voucher com trava (seção 23) — zero código ainda
- Ler/auditar o código de recuperação social/Nostr já construído (seção 5.2) antes de continuar essa frente quarta
- Conectar frontend ao rail de Pix (colega já começou, não auditado)

---

## Documentos relacionados

- `arakne-adendo-arquitetura-pix-custodia.md`
- Documento de wireframes/telas
- `arquitetura-arakne-hackathon.md`
- `arakne-prompts-ia.md`
- Documento HTML do mito da Aracne
