"""Mercado Pago Pix API client — creates Pix Cobrança dinâmico charges and
reads back payment status by txid (external_reference).

Falls back to mock mode when MP_ACCESS_TOKEN is unconfigured, same pattern
as services/lnbits.py, so the hackathon demo works before a real Mercado
Pago account is wired up.

Por que Pix Cobrança dinâmico (não uma chave Pix fixa): uma chave fixa não
diz sozinha de qual usuária pseudônima veio um pagamento — atribuir por
nome/CPF de quem enviou exigiria guardar um mapa "identidade real ↔ usuária
pseudônima", que é um ponto único de exposição catastrófica se vazar. Cada
cobrança carrega um txid próprio (nosso `external_reference`); o webhook do
Mercado Pago devolve esse mesmo id, e a atribuição fica automática e
inequívoca, não importa de qual conta bancária ela mandou. Ver seção 8 do
doc mestre.
"""

import logging
import secrets

import httpx

from app.config import MP_ACCESS_TOKEN, MP_API_URL, MP_WEBHOOK_URL, PIX_NOME_RECEBEDOR

logger = logging.getLogger(__name__)


class MercadoPagoPixError(Exception):
    """Erro irrecuperável falando com o Mercado Pago (não cai em mock)."""


class MercadoPagoPixService:
    """Cliente síncrono da API de Pagamentos do Mercado Pago, restrito a Pix.

    Se MP_ACCESS_TOKEN estiver vazio, o serviço inicia em modo mock. Se uma
    chamada real falhar em runtime, cai pra mock só naquela chamada — ao
    contrário do LNbits, aqui um 5xx passageiro do PSP não deve travar o
    serviço inteiro pro resto da sessão, então cada método trata sua própria
    falha (não existe um "self._mock = True" permanente pós-erro).
    """

    def __init__(self, access_token: str, base_url: str):
        self.access_token = access_token
        self.base_url = base_url.rstrip("/")
        self._mock = not bool(access_token)

    @property
    def is_mock(self) -> bool:
        return self._mock

    def _headers(self, idempotency_key: str | None = None) -> dict:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }
        if idempotency_key:
            headers["X-Idempotency-Key"] = idempotency_key
        return headers

    # ── Mock helpers ─────────────────────────────────────────────

    @staticmethod
    def _mock_cobranca(valor_brl: float, txid: str) -> dict:
        return {
            "mp_payment_id": "mock_" + secrets.token_hex(8),
            "txid": txid,
            "status": "pending",
            "qr_code": f"00020126mockpix{txid}52040000530398654{valor_brl:.2f}5802BR6009MOCKCITY",
            "qr_code_base64": "",
            "ticket_url": f"https://mock.mercadopago.local/pix/{txid}",
        }

    @staticmethod
    def _mock_consulta(mp_payment_id: str) -> dict:
        return {
            "mp_payment_id": mp_payment_id,
            "status": "approved",
            "external_reference": None,
        }

    # ── API methods ──────────────────────────────────────────────

    def criar_cobranca(self, valor_brl: float, txid: str, descricao: str) -> dict:
        """Cria uma cobrança Pix dinâmica (QR + copia-e-cola) no Mercado Pago.

        `txid` é gravado como `external_reference` — é ele que volta no
        webhook e permite casar o pagamento com o empréstimo certo, sem
        precisar saber quem é a pagadora de verdade.

        Retorna {mp_payment_id, txid, status, qr_code, qr_code_base64, ticket_url}.
        """
        if self._mock:
            return self._mock_cobranca(valor_brl, txid)
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.post(
                    f"{self.base_url}/v1/payments",
                    headers=self._headers(idempotency_key=txid),
                    json={
                        "transaction_amount": round(valor_brl, 2),
                        "description": f"{PIX_NOME_RECEBEDOR} — {descricao}",
                        "payment_method_id": "pix",
                        "external_reference": txid,
                        "notification_url": MP_WEBHOOK_URL or None,
                        # Mercado Pago exige um payer com e-mail; como não
                        # guardamos identidade real, usamos um e-mail
                        # sintético por txid (não é usado pra contato).
                        "payer": {"email": f"{txid}@arakne.invalid"},
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                transacao = data.get("point_of_interaction", {}).get("transaction_data", {})
                return {
                    "mp_payment_id": str(data["id"]),
                    "txid": txid,
                    "status": data.get("status", "pending"),
                    "qr_code": transacao.get("qr_code", ""),
                    "qr_code_base64": transacao.get("qr_code_base64", ""),
                    "ticket_url": transacao.get("ticket_url", ""),
                }
        except Exception as e:
            logger.warning("Mercado Pago criar_cobranca falhou — caindo pra mock: %s", e)
            return self._mock_cobranca(valor_brl, txid)

    def consultar_pagamento(self, mp_payment_id: str) -> dict:
        """Consulta o status atual de um pagamento pelo id do Mercado Pago.

        Retorna {mp_payment_id, status, external_reference}. `status` é um
        dos valores nativos do Mercado Pago: "pending", "approved",
        "rejected", "cancelled", etc.
        """
        if self._mock or not mp_payment_id:
            return self._mock_consulta(mp_payment_id)
        try:
            with httpx.Client(timeout=10) as client:
                resp = client.get(
                    f"{self.base_url}/v1/payments/{mp_payment_id}",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "mp_payment_id": str(data["id"]),
                    "status": data.get("status", "pending"),
                    "external_reference": data.get("external_reference"),
                }
        except Exception as e:
            logger.warning("Mercado Pago consultar_pagamento falhou: %s", e)
            raise MercadoPagoPixError(str(e)) from e

    @staticmethod
    def extrair_payment_id_da_notificacao(payload: dict) -> str | None:
        """Extrai o id de pagamento de um payload de webhook do Mercado Pago.

        O Mercado Pago manda variações de formato ao longo do tempo; cobrimos
        as duas mais comuns:
          - {"type": "payment", "data": {"id": "123"}}
          - {"topic": "payment", "resource": ".../v1/payments/123"}
        Notificações de outros tipos (ex.: "merchant_order") devolvem None —
        o chamador deve ignorá-las sem erro.
        """
        if payload.get("type") == "payment" or payload.get("topic") == "payment":
            data = payload.get("data") or {}
            if isinstance(data, dict) and data.get("id"):
                return str(data["id"])
            resource = payload.get("resource", "")
            if resource:
                return resource.rstrip("/").rsplit("/", 1)[-1]
        return None


# Module-level singleton
pix = MercadoPagoPixService(MP_ACCESS_TOKEN, MP_API_URL)
