# Arakne — Documento Mestre: Mecanismos, Arquitetura e Decisões

> Este documento consolida tudo que foi decidido até agora: o mecanismo central, a arquitetura de cada camada, o racional por trás de cada decisão, o que é MVP de hackathon vs. arquitetura-alvo, e o que ainda está pendente. É o documento de referência único do time — os outros arquivos (adendo de Pix/custódia, wireframes, prompts de IA) continuam existindo, mas este é o ponto de partida.

**Tagline:** "Cada fio, uma mulher. Cada nó, uma confiança."

---

## Sumário

1. Tese e conceito central
2. Identidade de marca e vocabulário
3. Motor de crédito — regras determinísticas
4. Camada de disfarce e mecanismos de revelação
5. Ponto Arakne — autenticação e recuperação social
6. Custódia do fundo
7. Camada de gasto — modelo Tando via Pix
8. Disfarce financeiro no rail brasileiro (Pix)
9. Proteção cambial do empréstimo
10. Generalização multi-moeda
11. Modelo de sustentabilidade — juros
12. Exemplos de referência
13. Stack técnica e status de implementação
14. MVP (hackathon) vs. Arquitetura-alvo — tabela consolidada
15. Pendências consolidadas
16. Roadmap — Camada de investimento (staking do pool)
17. Documentos relacionados

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

**Regras (pseudocódigo já validado):**
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

**Racional:** o primeiro crédito não exige padrão de crochê completo, só aval — ajuda a usuária logo no início, sem barreira de competência antes do primeiro empréstimo. Em troca, o aval deixa de ser gratuito: quem avaliza passa a ter risco real. Isso troca "prova de tarefa" (sinal fraco) por "reputação real em jogo" (sinal forte) — o mesmo princípio validado por Grameen Bank e Zidisha (seção 12).

**Regra central do produto:** a usuária pode sacar com dívida em aberto — isso é intencional, é o ponto inteiro do produto. Ciclo: pedir → sacar → usar no mundo real → depositar → pagar → subir de tier.

---

## 4. Camada de disfarce e mecanismo de revelação

O catálogo de padrões de crochê é a Home pública — e não é uma fachada vazia: é um app de aprendizado de crochê **real e funcional**, com conteúdo genuíno sendo construído pelo time. Isso é o que torna o disfarce robusto — não há nada "falso" pra alguém desconfiado encontrar, porque não existe uma versão fake por trás de uma versão real; existe só o app, inteiro, fazendo o que diz que faz.

**Revelação (mecanismo único):** o card "Ponto Arakne" vive dentro do próprio catálogo de padrões, como mais um item de aprendizado — não é uma tela separada de segurança (ver seção 5 para o mecanismo completo do gesto). Tocar nele e performar o gesto correto revela a camada financeira. Qualquer outra interação — tocar no card e errar o gesto, ou navegar por qualquer outra parte do app — mantém tudo como conteúdo de crochê normal, porque é exatamente isso que é.

**Por que não existe mais uma "tela decoy" separada:** num desenho anterior, um segundo gesto secreto levava a uma tela decoy dedicada, pensada para o cenário de alguém forçar a usuária a "provar" o app. Isso deixou de ser necessário: como o app inteiro já é genuíno por padrão, e como errar o gesto do Ponto Arakne já mostra conteúdo comum sem nenhum rastro (seção 5), a própria superfície do app cumpre esse papel o tempo todo — não é preciso um segundo mecanismo secreto pra chegar lá. Um gesto a menos pra lembrar sob estresse.

**Depois da revelação, o disfarce continua.** A camada financeira usa o mesmo vocabulário de disfarce da seção 2 — nenhum termo financeiro real aparece, mesmo já dentro da parte revelada. Do ponto de vista de quem olhar a tela por cima do ombro dela, mesmo depois do "sim", ainda parece um app de costura.

---

## 5. Ponto Arakne — autenticação e recuperação social

### 5.1 O mecanismo

O **Ponto Arakne** é um gesto/padrão que a própria usuária cria — não é senha ou PIN predefinido. Propositalmente difícil de configurar (fricção alta na criação, pra não ser trivial de adivinhar ou reproduzir sob observação) e fácil de sair (saída rápida de volta ao disfarce, inclusive sob coação).

**Nome do card (decisão fechada):** o card se chama "Ponto Arakne" — mesmo nome do produto — de propósito. Isso funciona porque (a) o padrão visual por trás do nome é único e aleatório por usuária, então pesquisar "Ponto Arakne" na internet não revela o gesto de ninguém, só o nome genérico; e (b) a mitologia do produto já justifica a existência dele — "pra ser uma Arakne, você precisa ter esse ponto feito" é verdade dentro da própria narrativa da marca, então ela pode explicar isso a qualquer pessoa sem soar como desculpa.

### 5.2 Recuperação social

Se a usuária erra o Ponto Arakne **8 vezes** (as pernas da aranha), o Ponto trava — deixa de funcionar como credencial. Não existe "tentar de novo": o card passa a mostrar um ponto de crochê genérico qualquer, sem nenhum indício de que ali existia uma credencial financeira.

A recuperação usa um **vouch de recuperação** — tipo de vouch diferente do vouch de crédito, sem consequência financeira (quem ajuda não assume risco de tier), condicionado a quem recebe o pedido se sentir segura para ajudar.

**Fluxo completo:**
1. Ela gera um QR code de recuperação (⚠️ tela ainda a desenhar) para outra integrante da rede escanear — o processo não recomeça sozinho, ela precisa iniciar.
2. O pedido chega primeiro para quem originalmente fez vouch por ela, com mensagem disfarçada: *"Uma de suas aranhinhas pediu uma aula sobre o Ponto Arakne, pode ajudar?"*
3. **Divulgação progressiva, dois elos por vez:** quem aceita ajudar não vê a identidade de quem precisa de ajuda — vê só os dois próximos apelidos na cadeia de vouch, e precisa contatar essa pessoa pessoalmente, fora do app, pra continuar repassando. Se o contato não acontecer em algum ponto da cadeia, nada além disso é exposto e nada acontece — mesmo princípio de "se nada puder ser feito, nada pode ser feito" aplicado à privacidade do grafo.
4. Se a pessoa no topo da escalada não responder dentro da janela de tempo, o pedido sobe um nível na cadeia de vouch, com mensagem ajustada: *"...as outras estão ocupadas, pode ajudar?"*
5. **Tempos de escalonamento (decisão fechada, mantidos mesmo com o relay manual):** 24h no 1º nível, 12h no 2º, 6h no 3º, metade do anterior daí em diante. Racional: cenário de risco de vida exige velocidade, não conveniência — um toque da pessoa seguinte costuma bastar pra reengajar quem só estava ocupada.
6. A cadeia pode escalar até as fundadoras (raiz do grafo de vouch, por serem as primeiras usuárias) como âncora de última instância. Aceitável para o MVP; não escala sozinho em produção.
7. **Sem override administrativo.** Se a cadeia inteira não responder, a conta permanece travada — nem a Arakne consegue destravar sozinha. Essa garantia é o que torna o mecanismo seguro contra um agressor que descobre e pressiona quem teria esse poder.
8. **Só depois do "sim" da rede**, aparece uma "aula de um ponto novo" — um ponto de crochê genuíno e aleatório, cuja coreografia de gesto *é*, ao mesmo tempo, a definição do novo Ponto Arakne. Nunca uma tela óbvia de "crie sua nova senha".
9. **Completar a aula não entra na camada financeira** — ela volta pro catálogo de padrões, não pro dashboard financeiro. Recuperar a credencial e revelar o financeiro continuam sendo dois atos separados: ela ainda precisa tocar no card e performar o Ponto novo deliberadamente depois (seção 4) — a recuperação não a leva direto pro financeiro.

**Acesso a partir de outro dispositivo** só é possível de duas formas: (a) as chaves da carteira + o Ponto Arakne dela, ou (b) recuperação social pelo fluxo acima.

### 5.3 Custódia da chave da carteira

A chave (formato nativo nostr, `nsec...`) fica a critério da própria usuária: ela pode anotar e guardar sozinha, ou deixar uma cópia com alguém de confiança específica — uma "elder" da comunidade ou uma amiga. Não é um mecanismo técnico, é uma prática deixada aberta de propósito, porque acesso por outro dispositivo exige as duas coisas juntas (chave **+** Ponto Arakne), então perder só uma não é suficiente pra travar nem pra vazar sozinha.

**Ressalva registrada, não resolvida:** deixar a chave com uma pessoa específica troca risco técnico por risco relacional — se o vínculo de confiança mudar depois, a chave continua com essa pessoa. Aceito como decisão para o hackathon; usar o formato nativo do nostr (em vez de mascarar como algo mais discreto) também é uma concessão consciente — `nsec1...` é reconhecível por quem conhece cripto/nostr, algo menor que uma seed phrase de 12 palavras em inglês, mas não nulo.

### 5.4 Por que é intencional, não só "esqueci minha senha"

O mecanismo dá à usuária a opção de **se trancar de propósito**. Sob coação, esgotar as tentativas deliberadamente é uma saída válida: os recursos ficam intactos e inacessíveis, e destravar exige um passo social que o agressor não consegue forçar sozinho.

---

## 6. Custódia do fundo

**Problema que resolve:** o mecanismo de vouch/tier exige que alguém tenha poder de decisão sobre saldo e liberação — incompatível com "cada usuária com chave privada non-custodial de verdade" (ex.: Breez SDK puro). Uma carteira de **custódia compartilhada** resolve isso sem fingir que o produto é algo que não é.

**Estrutura-alvo:**
- **Reserva fria (multisig on-chain, 2-de-3 ou 3-de-5):** a maior parte do fundo, sob controle coletivo de stewards de confiança — nenhuma parte sozinha move fundos. É aqui que mora a custódia compartilhada de fato.
- **Liquidez quente (nó Lightning):** saldo operacional menor, rebalanceado a partir da reserva fria, viabiliza liberação e liquidação instantâneas.
- **Ledger interno:** o saldo de cada usuária continua sendo uma linha no banco (`saldo_sats`, `saldo_devedor`) — isso não muda.

**Por que é honesto, não uma contradição:** o produto não precisa fingir ser totalmente non-custodial — ele é um fundo com custódia compartilhada e governança coletiva, parecido com uma cooperativa de crédito (seção 12). É uma resposta mais forte no pitch do que tentar encaixar non-custodial puro num mecanismo que precisa congelar tier em caso de default.

---

## 7. Camada de gasto — modelo Tando via Pix

O [Tando](https://tando.me/) deixa qualquer pessoa no Quênia gastar Bitcoin em qualquer lugar que aceite M-Pesa, sem o lojista saber ou se importar com Bitcoin — modelo BYOB(W), nunca custodia o saldo do usuário. O paralelo com o Arakne é direto: **Pix no lugar de M-Pesa**, com a diferença de que o dinheiro gasto é crédito do fundo compartilhado, não saldo próprio.

| Tando (M-Pesa) | Arakne (Pix) | Status |
|---|---|---|
| Escanear QR Code | Scanner de QR Pix (BR Code) | ✅ construído — parser EMV/TLV com CRC16/CCITT-FALSE |
| Buy Goods | Pagar comerciante | ✅ mesma infra do scanner |
| Pay Bills | Pagar contas (boleto/Pix) | ✅ mesma infra |
| Send Money | Enviar por chave Pix, sem QR | ⚠️ falta construir |
| Cotação antes de confirmar | Serviço de cotação com trava de câmbio | ✅ construído |
| Liquidação instantânea | Cliente PSP com idempotência | ✅ construído, com tratamento de timeout vs. falha |

**Conclusão:** ~80% do "motor Tando" já existe da sprint de Pix. Falta (a) enviar por chave Pix sem QR, e (b) reposicionar a UI como a experiência central de "gastar o kit", não como saque genérico.

---

## 8. Disfarce financeiro no rail brasileiro (Pix e boleto)

> Específico do Brasil — cada país vai precisar da própria versão desta seção (ver seção 10, item 3).

O desembolso (Arakne → usuária) é fácil de disfarçar: chega como Pix recebido de conta com nome comercial inofensivo. O **repagamento** é o ponto cego: é uma transferência que sai da conta dela, aparece no app do banco dela (fora do controle do Arakne), e o Pix exige mostrar o nome real do destinatário antes de enviar — proteção antifraude do próprio rail, que não dá pra contornar só com UI.

**Requisitos de design:**
1. **Pessoa jurídica real com nome comercial inofensivo recebendo os pagamentos** (ex.: "Ateliê Fio de Ouro Materiais Artesanais") — precisa ser CNPJ de verdade, pois é esse nome que aparece na tela de confirmação do banco dela.
2. Mesma identidade nos dois sentidos (desembolso e repagamento) — narrativa coerente.
3. Evitar padrão de parcela — variar valores, evitar datas fixas repetidas.
4. Descrição do Pix sempre temática, nunca "empréstimo" ou "Arakne".
5. Canal alternativo sem passar pelo banco dela: boleto em casa lotérica, ou agente de confiança fazendo o Pix por ela (infra do parser de boleto já existe).

**Estado atual (MVP hackathon):** conta Pix pessoal da fundadora. Funciona para demo entre a equipe, mas o nome exposto na confirmação é o nome real dela — o item 1 acima é o que resolve isso, e depende de investimento + abertura de PJ.

### Atribuição de repagamento: Pix Cobrança em vez de chave fixa

**O problema que isso resolve:** receber Pix numa chave fixa não diz, por si só, de qual usuária pseudônima veio o pagamento — e tentar descobrir isso pelo nome/CPF de quem enviou exigiria o Arakne guardar um mapa "identidade real ↔ usuária pseudônima", que é, sozinho, um ponto único de exposição catastrófica se vazar, for invadido, ou for alvo de uma ordem judicial.

**Mecanismo escolhido:** cada repagamento gera um **QR de Pix Cobrança dinâmico**, próprio daquela transação, com um `txid` único embutido — a mesma lógica do "nosso número" de um boleto (seção anterior), aplicada ao Pix. Quando ela paga aquele QR específico, o webhook do PSP volta com o `txid`, e a atribuição é automática e inequívoca, não importa de qual conta bancária ela mandou. **Princípio geral:** referência única por transação é sempre preferível a mapear identidade real — evita o mapa inteiro, não só protege ele.

**Depósito sem identificação (Pix direto pra uma chave fixa, por exemplo, em vez do Pix Cobrança) vai para o fundo como capital, sem obrigação de pagamento de juros** — e não quita o `saldo_devedor` dela, já que não há como atribuir o pagamento a uma usuária específica. Vale ter uma comunicação clara pra ela sobre isso: pagar de um jeito não rastreável não conta como pagamento do kit, mesmo que o dinheiro entre no fundo.

**Não implementado ainda (ver seção 15):** hoje a stack só tem a capacidade de *ler* QR de terceiros (fluxo de gasto, seção 7); gerar um QR de cobrança próprio por transação é capacidade nova.

### Boleto como canal de repagamento

Um boleto emitido pela Arakne (não pelo Pix) é outro caminho de repagamento, com vantagens próprias: pode ser pago em dinheiro, em qualquer banco, lotérica, ou farmácia/supermercado que aceite esse tipo de cobrança — sem precisar passar pelo app do banco dela.

**Sobre a flutuação cambial no momento da emissão:** não é um problema novo. O mecanismo da seção 9 já fixa a dívida dela em moeda local, então o valor do boleto fica igualmente fixo entre a emissão e o pagamento, não importa quantos dias se passem ou quanto o BTC varie nesse meio-tempo — o fundo absorve a diferença na conversão final, exatamente como já desenhado. Um boleto, por ser um instrumento de valor fixo por natureza, encaixa bem nesse mecanismo — até melhor que o Pix, que depende de uma trava de cotação de 60 segundos pensada pra uma transação ao vivo.

**Emissão:** boleto pode ser emitido por pessoa física, sem CNPJ, por várias plataformas (ex.: Efí Bank, InfinitePay, Cobre Fácil). Mas o beneficiário/cedente que aparece no boleto **precisa ser "Arakne"**, com o nome de crochê inofensivo — nunca o nome pessoal de quem está por trás. O nome dela como **pagante** pode aparecer normalmente; isso não compromete o disfarce, porque não é incomum ou suspeito que ela mesma pague algo pelo próprio banco — o que precisa ficar disfarçado é o destino do pagamento, não a origem. Vale confirmar com a plataforma escolhida se dá pra configurar um nome fantasia como cedente mesmo numa conta pessoa física (algumas parecem permitir, mas isso ainda não foi validado na prática) — se não der, a mesma PJ que resolve o Pix (item 1 acima) resolve o boleto também, é a mesma dependência.

**Não precisa imprimir.** O boleto tem uma linha digitável (código numérico) e um código de barras — ambos pagáveis 100% digital: ela digita a linha digitável direto no app do banco ou num caixa eletrônico, ou mostra o código de barras na tela do próprio celular pra alguém escanear. Isso importa especialmente pro público do Arakne, que muitas vezes não tem acesso seguro ou discreto a uma impressora.

**Detalhe técnico a configurar:** boletos têm data de vencimento, e algumas plataformas bloqueiam pagamento depois disso — vale configurar aceite de pagamento em atraso, ou um fluxo simples de reemissão, porque a realidade da usuária pode não permitir pagar exatamente na janela prevista.

**Outros canais alternativos, além do boleto:**
- **Boleto pago em espécie no guichê:** já cai na mesma atribuição por referência única do boleto (seção anterior) — resolve "quero pagar em dinheiro" sem reintroduzir a necessidade de um mapa identidade-real ↔ usuária.
- **Lotérica mediando um Pix:** ela entrega o dinheiro em espécie, o atendente faz a transferência — uma versão institucionalizada do agente de confiança já mencionado no item 5 acima. Vale usar o mesmo Pix Cobrança dinâmico aqui também, pra manter a atribuição automática.

---

## 9. Proteção cambial do empréstimo

**O problema:** dois riscos de volatilidade, separados por ordem de grandeza — volatilidade de tesouraria (minutos, ~0,15%, já coberta pelo spread da cotação travada) e volatilidade de denominação do empréstimo (semanas/meses, ~15-25%, que é o problema real). Dívida em sats com renda em moeda local é um descasamento cambial estrutural, o mesmo mecanismo que torna dívida soberana dolarizada perigosa em mercados emergentes.

**Mecanismo escolhido:** denominação na moeda local + fundo absorve a diferença. Não são duas opções concorrentes — denominar em moeda local só funciona se o fundo absorver o resultado cambial.
1. Empréstimo concedido com valor fixo em moeda local (ex.: R$150), convertido a sats na cotação do dia.
2. O preço do BTC varia livremente durante o prazo — não afeta o que ela deve.
3. Repagamento no mesmo valor fixo em moeda local, convertido a sats na cotação do dia do pagamento.
4. A diferença é absorvida pelo fundo, não pela mutuária.

Stablecoin local e hedge com derivativos ficam como notas de roadmap (risco de contraparte/liquidez rasa, e complexidade operacional demais para o hackathon, respectivamente).

**Dimensionamento do buffer:** limitar o livro de empréstimos ativos a uma fração do fundo total (ex.: 30-50%), mantendo o resto como colchão — equivalente a um índice de capital adequado, mas para risco cambial. A reserva fria da seção 6 *é* esse colchão. Refinamento opcional: banda de proteção (±10%, excedente dividido meio a meio) em vez de indexação total, se quiserem reduzir o risco de cauda do fundo.

---

## 10. Generalização multi-moeda

O mecanismo da seção 9 é moeda-agnóstico por construção. Assimetria importante: **o lado do depósito nunca tem descasamento cambial** — depósito é sempre em BTC, de qualquer lugar. O problema de moeda só existe do lado do empréstimo.

**Efeito de diversificação:** espalhar o livro por moedas locais não correlacionadas reduz o risco agregado do fundo — mesmo princípio de um banco não concentrar carteira num único setor. Ressalva: em estresse cambial global, moedas emergentes tendem a se mover juntas; o buffer precisa considerar esse cenário, não só o caso médio.

**O que muda na arquitetura:**
1. Generalizar o schema agora (campo `moeda_local`), construir os rails depois.
2. Oráculo de câmbio por moeda (exchanges locais ou agregadores).
3. **Um rail por país, não um rail universal** — Pix, M-Pesa, UPI são projetos de integração próprios, cada um.
4. Lugares sem rail formal (ex. Afeganistão) precisam de um modelo de saída totalmente diferente — agente físico, rede informal (hawala), ou gasto direto em Lightning. Documentar como "camada de saída tier 3" separada.

---

## 11. Modelo de sustentabilidade — juros

**Decidido:** juros flutuantes com base na Selic, com spread para baixo (a Selic brasileira é historicamente alta; mesmo abaixo dela o produto segue competitivo frente a crédito tradicional).

**Pendente:** o número exato do spread. Não é só decisão de precificação — é o que financia o buffer de capital cambial da seção 9. Um spread baixo demais deixa o produto competitivo, mas não sobra reserva pra absorver a volatilidade do BTC. Os dois números (spread e tamanho do buffer) precisam ser decididos juntos. Fonte de dado: Selic tem série pública na API do Banco Central (SGS), dá pra puxar automático.

---

## 12. Exemplos de referência

| Modelo | O que valida | Onde o Arakne diverge |
|---|---|---|
| **Grameen Bank** (Muhammad Yunus, Bangladesh) | Empréstimo em grupo com aval social como garantia — sem colateral físico, sem crédito tradicional | Arakne é global e pseudônimo, não presencial/local |
| **Zidisha** | Microcrédito P2P direto, sem intermediário local, via plataforma digital | Arakne usa Bitcoin/Lightning como trilho, não conversão fiat direta |
| **SACCO** (cooperativas de crédito e poupança, comuns na África Oriental) | Fundo compartilhado com governança coletiva financiando empréstimos mútuos entre membros — mesmo modelo da custódia compartilhada (seção 6) | SACCO normalmente exige registro formal (CNPJ-equivalente); a usuária do Arakne muitas vezes não pode se associar formalmente sem risco, então a estrutura precisa ser pseudônima e resistente a censura |

---

## 13. Stack técnica e status de implementação

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | Python + FastAPI + SQLite | Zero fricção de infra em 2 semanas |
| Frontend | React + Vite + TypeScript, mobile-first (PWA) | Roda em qualquer celular via navegador, sem loja de app |
| Pagamentos | LNbits (self-hosted via Docker) sobre nó signet/testnet | API REST pronta pra wallet por usuária, invoice, checagem de pagamento |
| Demo | Docker compose local | Não depende de wifi do evento; ter vídeo de backup |

**Já implementado:**
- Sistema de conta: `saldo_sats` (disponível) separado de `saldo_devedor` (dívida), com endpoints de depósito/saque/extrato/saldo
- Correção de vulnerabilidade IDOR em `/emprestimos` (não tinha autenticação nenhuma antes)
- Parser de BR Code Pix (EMV/TLV, validação CRC16/CCITT-FALSE), cotação travada por 60s, cliente PSP com idempotência e tratamento de timeout vs. falha de pagamento
- Gerador de keypair secp256k1 local (`arakne-crypto.ts`, nostr-tools), chave privada nunca sai do dispositivo — criptografada em repouso com AES-GCM via PIN (PBKDF2, 250k iterações)
- Suite de testes: 41 passando
- CORS configurado

**Ainda não implementado (ver seção 14 e 15):** rails além do Pix, custódia multisig, Ponto Arakne (mecanismo completo da seção 5), disfarce financeiro no rail bancário (PJ), denominação em moeda local, tela de recuperação social.

---

## 14. MVP (hackathon) vs. Arquitetura-alvo

| Mecanismo | MVP (hackathon, 14 dias) | Arquitetura-alvo |
|---|---|---|
| Custódia do fundo | Nó LNbits único (custódia única, transitória) | Reserva fria multisig (2-de-3+) + liquidez quente Lightning |
| Camada de gasto | Pix via QR (já ~80% pronto) | Modelo Tando completo: QR + chave Pix + multi-rail por país |
| Disfarce no rail bancário | Pix pessoal da fundadora | PJ (ou nome fantasia validado) com nome comercial inofensivo, dedicada |
| Canal de repagamento | Pix (chave fixa) + boleto pessoa física | Pix Cobrança dinâmico (atribuição por txid) + boleto (dinheiro, banco, lotérica) + agente/lotérica mediando Pix Cobrança |
| Camada de investimento | Wireframes de toda a superfície; só a tela de depósito é funcional, ligada a uma carteira Lightning da própria equipe (prova técnica, não captação pública) | Superfície separada da camada de disfarce, PJ dedicada conectada, staking com ciclos mensais de recompensa, pendente de validação jurídica |
| Proteção cambial | Documentada como política; implementação de denominação em moeda local é barata de fazer já | Denominação em moeda local + buffer dimensionado (30-50%) + banda de proteção opcional |
| Moeda | Só BRL | Schema genérico (`moeda_local`) + oráculo por moeda + rail por país |
| Juros | A definir (Selic − X%) | Mesma regra, com spread calibrado ao buffer necessário |
| Ponto Arakne | Card único, gesto simples | Fluxo completo: 8 tentativas, recuperação social com relay de dois elos, aula disfarçada de novo ponto |
| Recuperação social | Não implementada | Cadeia de vouch com escalonamento 24h/12h/6h..., até as fundadoras |
| Sem rail formal (ex. Afeganistão) | Fora de escopo | Camada de saída tier 3 (agente físico / rede informal) |
| Governança do fundo | Não implementada; wireframe/mock se sobrar tempo | Multisig com stewards reais, rotação de chaves documentada |

---

## 15. Pendências consolidadas

- **Tela de gerar o QR code de recuperação social** — ainda não desenhada (prioridade alta, é o ponto de entrada do fluxo de recuperação).
- **Fluxo de "enviar por chave Pix" sem QR** — falta construir (seção 7).
- **Geração de Pix Cobrança dinâmico por transação** — hoje a stack só lê QR de terceiros; emitir cobrança própria com `txid` é capacidade nova (seção 8).
- **Spread de juros abaixo da Selic** — número exato pendente, precisa ser decidido junto com o dimensionamento do buffer cambial (seções 9 e 11).
- **PJ com nome comercial inofensivo** — depende de investimento; até lá, MVP usa Pix pessoal (seção 8). Boleto pode não depender disso se a plataforma de emissão permitir nome fantasia numa conta pessoa física — ainda não validado (seção 8).
- **Cache do scanner de QR** — garantir que o frame da câmera (pagamento e recuperação) não fica salvo na galeria do sistema operacional.
- **Validação jurídica (escopo ampliado)** — cobre dois níveis, a serem discutidos com jurídico se houver investimento: (a) "aceite explícito de risco de perda" do lado da mutuária, evitando regulação de valor mobiliário; (b) a camada de investimento (seção 16) inteira — trocar "cota" por "posição de staking" não muda a substância jurídica por trás, e a jurisdição da entidade não resolve sozinha a jurisdição de quem está sendo captado, dado que a intenção é permitir "qualquer mulher/pessoa" participar.
- **Multisig real** (stewards, rotação de chaves) — arquitetura-alvo documentada, não implementada; aceitável adiar para pós-hackathon.
- **Configuração de vencimento do boleto** — aceite de pagamento em atraso ou fluxo de reemissão (seção 8).

**Resolvido nesta rodada:** modelo de ameaça de segurança completo (device, coação, backup, linguagem, proteção do Ponto Arakne, rede de apoio) — já fechado pelo time.

---

## 16. Roadmap — Camada de investimento (staking do pool)

> **Status: visão de arquitetura-alvo, não escopo funcional do hackathon** (exceto uma tela, ver 16.4). Pendente de validação jurídica antes de qualquer implementação real além do wireframe.

### 16.1 O que é

Um jeito de captar capital de investidoras que querem pool de crédito remunerado, apostando no fundo compartilhado (seção 6) performar bem — o que também cria mais incentivo pro fundo crescer. É uma camada de **público diferente** das mutuárias: quem investe aqui provavelmente não é a mesma pessoa sob controle coercitivo que o disfarce inteiro do produto existe pra proteger.

### 16.2 Vocabulário: de FIDC para blockchain

O mecanismo é o mesmo de um fundo de recebíveis tradicional (FIDC) — capital de terceiros financiando uma carteira de crédito, com retorno proporcional à performance — mas a linguagem certa pra esse produto é a nativa de DeFi, não a de mercado de capitais tradicional:

| Termo FIDC | Equivalente blockchain | O que representa no Arakne |
|---|---|---|
| Fundo / patrimônio líquido | Pool de crédito | O mesmo fundo compartilhado da seção 6 |
| Cota | Posição de stake / *pool share* | Proporção que a investidora tem do pool (mesma lógica de aTokens/cTokens da Aave/Compound) |
| Valor da cota / NAV | Exchange rate da posição | Patrimônio total ÷ posições emitidas — termo já nativo em DeFi |
| Cotista | Staker / *liquidity supplier* | Investidora que trava capital no pool |
| Administrador fiduciário / custodiante | Stewards do multisig (seção 6) | Papel já coberto pela arquitetura de custódia existente |
| Dividendo mensal | Recompensa por ciclo (*epoch*) | Ver mecânica abaixo |

### 16.3 Mecânica: distribuição discreta por ciclo (decisão fechada)

Entre os dois modelos que existem em DeFi, a escolha foi **distribuição discreta por ciclo mensal** (estilo Curve/GMX), não acumulação contínua (estilo Aave/Compound):
- A cada mês, o lucro líquido do pool (juros recebidos das mutuárias, menos perdas por default, menos custo operacional) é calculado e dividido pelas posições em circulação.
- A recompensa vira um "claim" reivindicável separadamente — a posição principal não cresce de valor sozinha, ao contrário do modelo de acumulação contínua.
- Ela só saca a recompensa, nunca o principal — o que trava capital como base estável de empréstimo e **é**, ao mesmo tempo, o colchão cambial da seção 9. Importante deixar transparente pra investidora: principal travado não é o mesmo que principal garantido — o valor da posição pode cair se o fundo tiver perda líquida.

**Arquitetura:** como o Arakne roda em Bitcoin/Lightning, não numa chain com contrato inteligente, isso não vira um token de verdade — vira mais uma tabela no mesmo banco que já guarda `saldo_sats`/`saldo_devedor`, só que pro lado investidor (`posicao_staking`, com principal travado e recompensas reivindicáveis). Precisa de um job/processo que fecha o cálculo do ciclo mensal — não é automático, alguém ou algo precisa rodá-lo.

### 16.4 Superfície e escopo para o hackathon

- **Interface separada** da camada de disfarce (seções 2 a 5) — público diferente, sem a mesma necessidade de esconder nada. Pode ser um dashboard aberto, com a estética da marca, sem disfarce têxtil.
- **PJ separada, porém conectada** à entidade operacional (a que lida com mutuárias) — segrega responsabilidade regulatória: se uma das duas tiver problema jurídico, a outra não cai automaticamente junto.
- **Escopo do hackathon:** wireframes de toda a camada de investimento. A única parte funcional real é a **tela de depósito**, conectada de fato ao fundo — mas usando uma **carteira Lightning da própria equipe**, não captação pública de terceiros. É demonstração de viabilidade técnica ponta a ponta, não uma oferta real de investimento — essa distinção importa para o enquadramento jurídico e não deve se perder de vista se o escopo dessa tela mudar depois.

### 16.5 Pendência jurídica (ver seção 15 para o item consolidado)

"Cotas com dividendo mensal por performance de fundo administrado por terceiros" é próximo da definição de valor mobiliário no Brasil (Lei 6.385/76) — o desenho mais parecido é um FIDC, que exige registro na CVM, administrador fiduciário licenciado e custodiante. Trocar "cota" por "posição de staking" muda a linguagem, não necessariamente a substância jurídica — reguladores tendem a olhar se existe expectativa de lucro a partir do esforço de terceiros administrando capital, não o nome do mecanismo (ex.: a SEC americana tratou programas de staking-as-a-service com recompensa prometida como valor mobiliário não registrado em pelo menos um caso de peso, Kraken, 2023). Jurisdição da entidade pode reduzir esse risco, mas não o elimina sozinha — regulação de valor mobiliário costuma olhar de onde vêm as investidoras, não só onde a empresa está registrada, e a intenção aqui é permitir "qualquer mulher/pessoa" participar, o que é oferta aberta, não fechada a uma jurisdição específica. Fica como pendência a discutir com jurídico se houver investimento — não bloqueia o hackathon dado o escopo da seção 16.4.

---

## 17. Documentos relacionados

- `arakne-adendo-arquitetura-pix-custodia.md` — versão detalhada, passo a passo, das seções 6 a 11 deste documento (histórico da discussão, mantido para referência).
- Documento de wireframes/telas (catálogo de padrões, camada financeira, estados de erro) — passado ao time de design.
- `arquitetura-arakne-hackathon.md` — plano de sprint original de 14 dias.
- `arakne-prompts-ia.md` — prompt 0 (contexto fixo) + 10 prompts sequenciais para execução com Claude Code.
- Documento HTML do mito da Aracne — peça narrativa conectando o mito ao mecanismo, usada no pitch.
