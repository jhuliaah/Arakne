"""Application configuration — reads from environment variables.

LNbits keys are empty by default; the backend falls back to mock mode.
To enable real Lightning payments, set LNBITS_ADMIN_KEY and LNBITS_POOL_KEY
after creating wallets in the LNbits UI (http://localhost:5000).
"""

import os

from dotenv import load_dotenv

# Fora do Docker, nada lê o .env sozinho — load_dotenv() acha o arquivo
# andando pelos diretórios pai a partir de onde o processo foi iniciado, e
# escreve cada CHAVE=valor na tabela de ambiente do processo atual.
load_dotenv()


LNBITS_URL = os.getenv("LNBITS_URL", "http://lnbits:5000")
LNBITS_ADMIN_KEY = os.getenv("LNBITS_ADMIN_KEY", "")
LNBITS_POOL_KEY = os.getenv("LNBITS_POOL_KEY", "")

# ── Pix (Mercado Pago) ──────────────────────────────────────
# MP_ACCESS_TOKEN empty by default; the pix service falls back to mock mode,
# same pattern as LNbits above. Get a token at
# https://www.mercadopago.com.br/developers/panel/app (produção ou teste).
MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")
MP_API_URL = os.getenv("MP_API_URL", "https://api.mercadopago.com")
# URL pública (ex.: via ngrok/cloudflared durante o hackathon) que o Mercado
# Pago vai chamar quando o Pix for pago. Sem isso, dá pra confirmar pagamento
# via polling manual em GET /pix/pagamentos/{txid}, mas o fluxo automático
# (o que sobe o tier sozinho) depende dela.
MP_WEBHOOK_URL = os.getenv("MP_WEBHOOK_URL", "")
# Nome comercial inofensivo que aparece pra usuária como recebedor do Pix
# (seção 8 do doc mestre — disfarce financeiro no rail brasileiro). Cosmético
# aqui (só entra na descrição da cobrança); o nome real que aparece na tela
# de confirmação do banco dela vem da conta Mercado Pago configurada no token
# acima, não deste texto.
PIX_NOME_RECEBEDOR = os.getenv("PIX_NOME_RECEBEDOR", "Ateliê Fio de Ouro Materiais Artesanais")

# ── Binance (conversão BRL → sats de volta pro pool) ────────
# Fecha o ciclo: quando o repagamento Pix confirma, o BRL que caiu na conta
# Mercado Pago precisa virar sats de volta no fundo Lightning, senão o pool
# fica permanentemente mais pobre a cada empréstimo. Vazio por padrão →
# modo mock (não compra/saca nada de verdade), mesmo padrão do LNbits/Pix.
# Ver seção 18 do doc mestre (addendum) pro racional de escolha da Binance.
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
BINANCE_API_URL = os.getenv("BINANCE_API_URL", "https://api.binance.com")

# ── Custódia compartilhada (reserva fria multisig) ──────────
# Preenchido depois de rodar scripts/gerar_multisig.py. Isto é só referência
# de leitura (descriptor + endereço público) — o backend nunca guarda chave
# privada de steward nem move fundos da reserva fria. Ver seção 6 do doc
# mestre e backend/app/routers/custodia.py.
MULTISIG_DESCRIPTOR = os.getenv("MULTISIG_DESCRIPTOR", "")
MULTISIG_ENDERECO = os.getenv("MULTISIG_ENDERECO", "")
MULTISIG_QUORUM = os.getenv("MULTISIG_QUORUM", "2-de-3")
MULTISIG_NETWORK = os.getenv("MULTISIG_NETWORK", "regtest")
