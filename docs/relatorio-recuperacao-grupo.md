# Recuperação de Conta — Comparativo para o Grupo

> Documento gerado para apresentação ao time. Compara a implementação atual (Opção E) com o fluxo descrito no documento-mestre (§5.2), justifica a recomendação para o hackathon, e mapeia o caminho de migração para produção.

---

## O que construímos (Opção E) e como funciona na prática

### Mecanismo

A chave privada Nostr da usuária (`nsec`) é dividida em **2 shares** usando Shamir Secret Sharing (T=2, N=2). Qualquer combinação de 2 shares reconstrói o nsec; 1 share isolada não revela nada.

| Share | Para onde vai | Como | Quem controla |
|---|---|---|---|
| **Share 0** | Convidadora (a mulher que indicou a dona) | Gift-wrap NIP-59 (criptografado com a chave pública da convidadora), publicado em relays Nostr | A convidadora — só ela desembrulha com seu nsec |
| **Share 1** | Backend (banco de dados) | Criptografada com o PIN da dona (AES-GCM-256 + PBKDF2 600k), enviada como blob opaco | A dona — só ela decripta com seu PIN |

**Invariante de segurança:** o backend guarda apenas 1 share. Como T=2, o backend **sozinho não consegue reconstruir o nsec** — precisa de 1 share da convidadora. A convidadora sozinha também não consegue — precisa de 1 share do backend.

### Fluxo de distribuição (onboarding da dona)

```
Dona cria conta → gera nsec/npub → desenha Ponto Arakne (padrão vira senha)
  ↓
RecoverySetupPage:
  1. splitNsec(nsec) → [share0, share1]
  2. share0 → gift-wrap NIP-59 → publica em relays Nostr (endereçado à convidadora)
  3. share1 → encryptWithPin(share1, PIN) → POST /usuarias/me/recovery-share (backend guarda blob)
  4. Mostra "código de reserva" (o PIN) para a dona anotar
```

### Fluxo de recuperação (novo dispositivo, dona perdeu o aparelho)

```
Dona abre app em aparelho novo → só sabe o identificador + PIN
  ↓
RecoverAccountPage:
  1. login(identificador, PIN) → autentica no backend
  2. GET /usuarias/me/recovery-share → recebe blob criptografado
  3. decryptWithPin(blob, PIN) → share1 (bytes)
  4. Gera nsec efêmero → gift-wrap "request" à convidadora via Nostr
  5. Aguarda resposta da convidadora (que desembrulha o shard guardado e envia share0 de volta)
  6. combineNsecWithCheck([share0, share1], expectedNpub) → nsec reconstruído
  7. Dona desenha novo Ponto Arakne → nsec re-criptografado com novo padrão
```

### Lado da convidadora (avalista)

Quando a convidadora abre o app e desenha seu Ponto Arakne (unlock):
1. `loadSharesIntoCache(pattern)` — descriptografa shares recebidas do localStorage
2. `startRecoveryListener(nsec, pattern)` — escuta relays Nostr por gift-wraps endereçados a ela
3. Quando recebe um **shard** (durante onboarding de uma dona): persiste criptografado com seu padrão
4. Quando recebe um **request** (durante recuperação): encontra a share no cache, gift-wrap de volta com a share

---

## O que o documento-mestre descreve (§5.2) e como difere

O mestre descreve um fluxo de **recuperação social em cadeia** — fundamentalmente diferente em arquitetura:

| Aspecto | Opção E (construída) | Documento-mestre (§5.2) |
|---|---|---|
| **Modelo** | 2 shares fixas: convidadora + backend | Cadeia de vouch social com escalonamento |
| **Quem participa** | 1 convidadora + 1 backend | Cadeia inteira de quem fez vouch, escalando até fundadoras |
| **Threshold** | T=2, N=2 (matemático, SSSS) | Não numérico — depende de alguém na cadeia responder |
| **Disponibilidade** | Backend sempre disponível + convidadora se estiver online | Depende de pessoas na cadeia responderem em janelas de tempo |
| **Escalonamento** | Não há — é estático | 24h → 12h → 6h → metade do anterior, subindo na cadeia |
| **Privacidade do grafo** | Convidadora sabe quem pediu (npub no rumor) | Divulgação progressiva: só 2 próximos apelidos por vez, contato fora do app |
| **Override admin** | Backend pode negar (mas não destravar sozinho) | Sem override — se a cadeia não responder, conta permanece travada |
| **Travamento do Ponto** | Não implementado (pendência) | 8 tentativas erradas → Ponto trava → só recuperação social destrava |
| **Aula de novo ponto** | RecoverAccountPage reconstrói nsec, não oferece "aula" | Aula disfarçada de ponto de crochê = definição do novo Ponto |
| **Tela de QR** | Não existe (pendência) | Dona gera QR para outra escanear e iniciar o fluxo |
| **Copy disfarçado** | "Preciso recuperar meu ateliê" | "Uma de suas aranhinhas pediu uma aula sobre o Ponto Arakne, pode ajudar?" |
| **Dependência de backend** | Sim — backend guarda share 1 | Não — puramente P2P via Nostr |
| **Backend pode reconstruir sozinho?** | **Não** (1 share, T=2) | N/A (backend não participa) |
| **Colusão para quebrar** | Backend + convidadora | Qualquer 2 pessoas na cadeia que respondam |

---

## Por que manter Opção E para o hackathon

1. **Funciona agora.** Está implementada, testada (68 testes backend, build frontend limpo) e integrada ao onboarding. A cadeia de vouch do mestre é arquitetura-alvo — implementá-la do zero em hackathon é inviável.

2. **Demoável ponta a ponta.** A dona perde o aparelho → entra com identificador + PIN → backend devolve share 1 → convidadora responde via Nostr → nsec reconstruído. Fluxo completo em <30s. A cadeia do mestre exige múltiplas pessoas online, janelas de 24h/12h/6h, e divulgação progressiva — não demoável em tempo de hackathon.

3. **Segurança criptográfica real.** SSSS T=2 N=2 com validação de pubkey (`combineNsecWithCheck`). O backend não consegue reconstruir sozinho (invariante verificada). A cadeia do mestre não tem garantia criptográfica — depende de confiança social e disponibilidade humana.

4. **Compatível com o threat model.** Mulheres sob controle coercitivo podem não ter uma cadeia de vouch com 3+ pessoas tech-savvy dispostas a participar. A Opção E precisa de 1 convidadora (que já existe no fluxo de indicação) + backend (sempre disponível).

5. **A cadeia do mestre pode ser construída por cima depois.** A Opção E não bloqueia a evolução — a cadeia de vouch pode substituir o papel do backend no futuro, mantendo a mesma infra de SSSS + NIP-59.

---

## Como ficaria em produção (comparativo)

| | Hackathon (Opção E) | Produção (mestre §5.2) |
|---|---|---|
| **Share 0** | Convidadora via NIP-59 | Cadeia de vouch: QR → escalonamento 24h/12h/6h → divulgação progressiva de 2 elos → fundadoras como âncora |
| **Share 1** | Backend (PIN-encrypted) | Removido — a cadeia substitui o backend. Ou: mantém como fallback se a cadeia inteira não responder |
| **Backend** | Guarda 1 share (não reconstrói sozinho) | Não guarda shares — só descoberta de npubs e grafo de vouch |
| **Travamento** | Não implementado | 8 tentativas → Ponto trava → só recuperação social destrava |
| **Aula pós-recuperação** | Não implementado | Aula disfarçada de ponto de crochê = novo Ponto Arakne |
| **Tela de QR** | Não implementado | Dona gera QR → outra escaneia → inicia cadeia |
| **Copy** | "Preciso recuperar meu ateliê" | "Uma de suas aranhinhas pediu uma aula sobre o Ponto Arakne, pode ajudar?" |
| **Override admin** | Backend pode negar acesso | Sem override — nem a Arakne consegue destravar sozinha |
| **Privacidade do grafo** | Convidadora vê npub da dona | Divulgação progressiva: só 2 apelidos por vez, contato fora do app |
| **Dependência humana** | 1 convidadora online | Múltiplas pessoas na cadeia, em janelas de tempo decrescentes |
| **Custo de implementação** | ✅ Feito (0 dias) | ~5-7 dias (backend do grafo de vouch + escalonamento + QR + UI da cadeia + travamento + aula disfarçada) |

### Caminho de migração hackathon → produção

1. **Manter Opção E como fallback** — se a cadeia de vouch não responder em N horas, cair no backend share (garantia de que a dona não fica travada permanentemente)
2. **Adicionar travamento do Ponto após 8 erros** — independente do mecanismo de recuperação, é requisito do mestre (§5.2/§5.4)
3. **Adicionar aula disfarçada de novo ponto** — pós-recuperação, independente do mecanismo
4. **Construir a cadeia de vouch** — backend do grafo, escalonamento temporal, divulgação progressiva, tela de QR
5. **Ajustar copy** — mensagem disfarçada do mestre

Os passos 2-3 são independentes e podem ser feitos já no hackathon. O passo 4 é pós-hackathon.

---

## Decisão pendente

A recuperação social já implementada (Opção E: convidadora + backend) diverge do fluxo do documento-mestre (cadeia de vouch com escalonamento). Três caminhos possíveis:

| Opção | Descrição | Custo |
|---|---|---|
| **Manter Opção E** | Suficiente para o hackathon. Cadeia de vouch fica como arquitetura-alvo pós-hackathon. Foco nas pendências de UX (travar Ponto após 8 erros, aula de novo ponto, copy disfarçado, cache scanner). | 0 dias (já feito) |
| **Implementar cadeia do mestre** | Substituir Opção E pela cadeia de vouch completa (QR → escalonamento 24h/12h/6h → divulgação progressiva → fundadoras). | ~5-7 dias |
| **Híbrido** | Manter Opção E como mecanismo técnico, mas adicionar a tela de QR do mestre como ponto de entrada visual — o QR inicia o fluxo Opção E em vez da cadeia. | ~1-2 dias |
