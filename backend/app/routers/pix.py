"""Router for Pix endpoints — gerar cobrança dinâmica e receber webhook do
Mercado Pago.

Este é o rail *real* de repagamento (dinheiro sai da conta bancária dela).
Não substitui `/emprestimos/{id}/pagamento` (Lightning simulado) — os dois
convivem; o Pix é o caminho que a usuária de verdade usa fora do app.

Disfarce: "cobrança" aparece na UI como "concluir o padrão", nunca como
fatura ou empréstimo (ver seção 2 do doc mestre). Aqui na API os nomes já
são técnicos de propósito — a camada de disfarce é responsabilidade do
frontend.
"""

import logging
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.emprestimo import Emprestimo
from app.models.pagamento_pix import PagamentoPix
from app.schemas.pix import (
    CobrancaPixRequest,
    CobrancaPixResponse,
    PagamentoPixResponse,
    WebhookPixResponse,
)
from app.services.pix import MercadoPagoPixError, pix
from app.services.risco import ao_quitar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pix", tags=["pix"])


def _gerar_txid(emprestimo_id: int) -> str:
    """Referência única por transação — nunca reaproveitada, nunca ligada a
    identidade real. Ver docstring de services/pix.py."""
    return f"arakne-{emprestimo_id}-{secrets.token_hex(6)}"


@router.post(
    "/emprestimos/{emprestimo_id}/cobranca",
    response_model=CobrancaPixResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Gerar cobrança Pix dinâmica pra repagar um kit",
    description="Cria um QR/copia-e-cola próprio da transação (txid único). "
    "Quando ela pagar, o webhook do Mercado Pago confirma automaticamente.",
)
def criar_cobranca_pix(
    emprestimo_id: int,
    payload: CobrancaPixRequest,
    db: Session = Depends(get_db),
):
    emprestimo = db.query(Emprestimo).filter(Emprestimo.id == emprestimo_id).first()
    if not emprestimo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empréstimo não encontrado")
    if emprestimo.status == "quitado":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empréstimo já quitado")
    if payload.valor_sats > emprestimo.usuaria.saldo_devedor:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "valor_sats maior que o saldo devedor atual",
        )

    txid = _gerar_txid(emprestimo_id)
    resultado = pix.criar_cobranca(
        valor_brl=payload.valor_centavos_brl / 100,
        txid=txid,
        descricao="padrão concluído",
    )

    pagamento = PagamentoPix(
        emprestimo_id=emprestimo_id,
        txid=txid,
        mp_payment_id=resultado["mp_payment_id"],
        valor_sats=payload.valor_sats,
        valor_centavos_brl=payload.valor_centavos_brl,
        status="pendente",
        qr_code=resultado["qr_code"],
    )
    db.add(pagamento)
    db.commit()

    return CobrancaPixResponse(
        txid=txid,
        mp_payment_id=resultado["mp_payment_id"],
        status=resultado["status"],
        qr_code=resultado["qr_code"],
        qr_code_base64=resultado["qr_code_base64"],
        ticket_url=resultado["ticket_url"],
        valor_sats=payload.valor_sats,
        valor_centavos_brl=payload.valor_centavos_brl,
    )


@router.get(
    "/pagamentos/{txid}",
    response_model=PagamentoPixResponse,
    summary="Consultar status de uma cobrança Pix pelo txid",
    description="Útil como fallback por polling se o webhook não estiver "
    "configurado (ex.: rodando local sem túnel público).",
)
def consultar_pagamento_pix(txid: str, db: Session = Depends(get_db)):
    pagamento = db.query(PagamentoPix).filter(PagamentoPix.txid == txid).first()
    if not pagamento:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cobrança não encontrada")
    return pagamento


def _confirmar_pagamento(pagamento: PagamentoPix, db: Session) -> None:
    """Efeitos de um Pix confirmado: abate saldo_devedor, reusa ao_quitar()
    se zerar — o mesmo gatilho que o fluxo Lightning já usa (routers/
    emprestimos.py), só trocando a origem do evento (webhook Pix em vez de
    polling LNbits)."""
    if pagamento.status == "aprovado":
        return  # idempotente — webhook pode reenviar a mesma notificação

    pagamento.status = "aprovado"
    pagamento.confirmado_em = datetime.utcnow()

    emprestimo = pagamento.emprestimo
    usuaria = emprestimo.usuaria
    usuaria.saldo_devedor = max(0, usuaria.saldo_devedor - pagamento.valor_sats)

    if usuaria.saldo_devedor == 0 and emprestimo.status != "quitado":
        ao_quitar(usuaria)
        emprestimo.status = "quitado"
        emprestimo.quitado_em = datetime.utcnow()

    db.commit()


@router.post(
    "/webhook",
    response_model=WebhookPixResponse,
    summary="Webhook do Mercado Pago — confirmação de pagamento Pix",
    description="Endpoint público (sem auth — o Mercado Pago não manda Bearer "
    "token nosso). Sempre responde 200 pra evitar reenvio em loop; notificações "
    "irrelevantes ou de txid desconhecido são silenciosamente ignoradas.",
)
async def webhook_pix(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        return WebhookPixResponse(ok=True)

    mp_payment_id = pix.extrair_payment_id_da_notificacao(payload)
    if not mp_payment_id:
        return WebhookPixResponse(ok=True)  # notificação de outro tipo (ex.: merchant_order)

    try:
        detalhe = pix.consultar_pagamento(mp_payment_id)
    except MercadoPagoPixError:
        # Deixa o Mercado Pago reenviar mais tarde em vez de mascarar como sucesso.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Falha ao consultar pagamento")

    if detalhe["status"] != "approved":
        return WebhookPixResponse(ok=True)

    pagamento = (
        db.query(PagamentoPix).filter(PagamentoPix.mp_payment_id == mp_payment_id).first()
    )
    if not pagamento:
        logger.warning("Webhook Pix: mp_payment_id %s sem cobrança correspondente", mp_payment_id)
        return WebhookPixResponse(ok=True)

    _confirmar_pagamento(pagamento, db)
    return WebhookPixResponse(ok=True)
