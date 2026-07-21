"""Binance API client — converte BRL recebido via Pix em sats depositados
de volta na wallet-pool do LNbits.

Fecha o "passo 4" do ciclo financeiro: quando uma usuária repaga via Pix, o
BRL cai na conta Mercado Pago da fundadora — mas isso é só uma baixa
contábil enquanto esse BRL não virar sats de verdade de volta no fundo
Lightning. Sem essa etapa, o pool fica permanentemente mais pobre a cada
empréstimo (sai sats no empréstimo, nunca volta sats no repagamento).

Não existe conversão BRL→sats automática — é sempre uma compra de Bitcoin
de verdade, através de uma corretora:
  1. Cotação atual (pra saber quanto BTC o BRL recebido compra)
  2. Ordem de compra a mercado (BRL → BTC)
  3. Saque via Lightning Network direto pra uma invoice da wallet-pool

Binance escolhida entre as opções avaliadas (Foxbit, BityBank/BitPreço,
Binance) por ser a única com rede Lightning documentada oficialmente na API
(não só na interface) e situação regulatória resolvida no Brasil em 2026 —
ver seção 18 do doc mestre (addendum) pro racional completo.

Falls back to mock mode when BINANCE_API_KEY/SECRET are unconfigured, same
pattern as services/lnbits.py e services/pix.py — MAS com uma diferença
importante de propósito: aqui tem dinheiro real se movendo (compra e
saque), então uma falha real em runtime NUNCA cai silenciosamente pra mock
como nos outros serviços — isso mascararia "a compra falhou" como "a
compra aconteceu", criando uma inconsistência contábil real (achar que o
pool foi creditado quando não foi). Falhas em runtime levantam
BinanceError; quem chama decide o que fazer (registrar como pendente,
tentar de novo depois, alertar alguém) — nunca finge sucesso.
"""

import hashlib
import hmac
import logging
import secrets
import time
from urllib.parse import urlencode

import httpx

from app.config import BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_API_URL

logger = logging.getLogger(__name__)


class BinanceError(Exception):
    """Erro irrecuperável falando com a Binance — nunca cai em mock."""


class BinanceService:
    """Cliente síncrono da API da Binance, restrito ao necessário: cotação
    pública, compra a mercado de BTC com BRL, e saque via Lightning Network.

    Autenticação: HMAC-SHA256 sobre a query string, enviado como parâmetro
    `signature`, com o header `X-MBX-APIKEY` — esquema padrão documentado em
    developers.binance.com/docs/wallet/capital/withdraw.
    """

    def __init__(self, api_key: str, api_secret: str, base_url: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip("/")
        self._mock = not (api_key and api_secret)

    @property
    def is_mock(self) -> bool:
        return self._mock

    def _signed_params(self, params: dict) -> dict:
        """Monta os parâmetros de uma chamada autenticada: timestamp +
        assinatura HMAC-SHA256 sobre a query string inteira, exatamente como
        a Binance exige."""
        params = {**params, "timestamp": int(time.time() * 1000), "recvWindow": 10000}
        query = urlencode(params)
        signature = hmac.new(
            self.api_secret.encode(), query.encode(), hashlib.sha256
        ).hexdigest()
        params["signature"] = signature
        return params

    def _headers(self) -> dict:
        return {"X-MBX-APIKEY": self.api_key}

    # ── Mock helpers ─────────────────────────────────────────────

    @staticmethod
    def _mock_cotacao() -> dict:
        # Preço fixo de propósito — mock precisa ser determinístico e
        # testável, não tenta simular volatilidade real.
        return {"symbol": "BTCBRL", "price": 350_000.0}

    @staticmethod
    def _mock_compra(valor_brl: float) -> dict:
        preco = BinanceService._mock_cotacao()["price"]
        qtd_btc = round(valor_brl / preco, 8)
        return {
            "order_id": "mock_" + secrets.token_hex(8),
            "status": "FILLED",
            "quantidade_btc": qtd_btc,
            "valor_brl_gasto": valor_brl,
            "preco_medio": preco,
        }

    @staticmethod
    def _mock_saque() -> dict:
        return {"withdraw_id": "mock_" + secrets.token_hex(8), "status": "mock_enviado"}

    # ── API methods ──────────────────────────────────────────────

    def cotacao_btc_brl(self) -> dict:
        """Cotação atual do par BTCBRL. Endpoint público — sem autenticação,
        sem custo de rate limit privado."""
        if self._mock:
            return self._mock_cotacao()
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(
                    f"{self.base_url}/api/v3/ticker/price",
                    params={"symbol": "BTCBRL"},
                )
                resp.raise_for_status()
                data = resp.json()
                return {"symbol": data["symbol"], "price": float(data["price"])}
        except Exception as e:
            logger.warning("Binance cotacao_btc_brl falhou — caindo pra mock: %s", e)
            return self._mock_cotacao()

    def comprar_btc_mercado(self, valor_brl: float) -> dict:
        """Compra BTC a mercado gastando exatamente `valor_brl` de BRL.

        Usa `quoteOrderQty` (valor na moeda de cotação) em vez de `quantity`
        (quantidade de BTC) — deixa a própria Binance calcular a quantidade
        pela cotação do momento da execução, evita erro de arredondamento
        nosso e garante que gastamos o valor exato recebido via Pix.

        Retorna {order_id, status, quantidade_btc, valor_brl_gasto, preco_medio}.

        Levanta BinanceError se a chamada falhar — nunca cai em mock aqui
        (ver docstring do módulo: falha real não pode virar "sucesso" fake).
        """
        if self._mock:
            return self._mock_compra(valor_brl)
        try:
            with httpx.Client(timeout=15) as client:
                params = self._signed_params(
                    {
                        "symbol": "BTCBRL",
                        "side": "BUY",
                        "type": "MARKET",
                        "quoteOrderQty": f"{valor_brl:.2f}",
                    }
                )
                resp = client.post(
                    f"{self.base_url}/api/v3/order",
                    headers=self._headers(),
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
                qtd_btc = float(data.get("executedQty", 0))
                valor_gasto = float(data.get("cummulativeQuoteQty", valor_brl))
                preco_medio = (valor_gasto / qtd_btc) if qtd_btc else 0.0
                return {
                    "order_id": str(data["orderId"]),
                    "status": data.get("status", "FILLED"),
                    "quantidade_btc": qtd_btc,
                    "valor_brl_gasto": valor_gasto,
                    "preco_medio": preco_medio,
                }
        except Exception as e:
            logger.error("Binance comprar_btc_mercado falhou: %s", e)
            raise BinanceError(str(e)) from e

    def sacar_lightning(self, invoice: str, valor_btc: float) -> dict:
        """Saca BTC via Lightning Network direto pra uma invoice específica.

        `network="LIGHTNING"` é o código de rede documentado oficialmente
        pela própria Binance — não é convenção nossa nem chute (ver
        developers.binance.com/docs/wallet/capital/deposite-address:
        "amount needs to be sent if using LIGHTNING network", confirmando
        tanto o nome da rede quanto a exigência do campo `amount` junto da
        invoice).

        Retorna {withdraw_id, status}.

        Levanta BinanceError se a chamada falhar — mesmo racional do
        `comprar_btc_mercado`: nunca finge que o saque saiu se não saiu.
        """
        if self._mock:
            return self._mock_saque()
        try:
            with httpx.Client(timeout=15) as client:
                params = self._signed_params(
                    {
                        "coin": "BTC",
                        "network": "LIGHTNING",
                        "address": invoice,
                        "amount": f"{valor_btc:.8f}",
                    }
                )
                resp = client.post(
                    f"{self.base_url}/sapi/v1/capital/withdraw/apply",
                    headers=self._headers(),
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()
                return {"withdraw_id": str(data.get("id", "")), "status": "enviado"}
        except Exception as e:
            logger.error("Binance sacar_lightning falhou: %s", e)
            raise BinanceError(str(e)) from e


# Module-level singleton
exchange = BinanceService(BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_API_URL)
