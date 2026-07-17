"""Router for 'Ponto de Troca' — peer liquidity nodes that redeem sats for
goods/material ("Fornecedoras de Linha").

Disguise: in the UI and API docs this is framed entirely as a trusted-peer
material exchange within the community — never mentions cash/money.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_usuaria
from app.database import get_db
from app.models.troca import Troca
from app.models.usuaria import Usuaria
from app.schemas.troca import (
    DisponibilidadeRequest,
    PontoDeTrocaResponse,
    TrocaCreateRequest,
    TrocaResponse,
)
from app.services.lnbits import lnbits
from app.services.risco import pode_ser_ponto_troca

router = APIRouter(tags=["pontos-de-troca"])


@router.put(
    "/pontos-de-troca/disponibilidade",
    summary="Ativar ou desativar-se como Ponto de Troca",
    description="Uma usuária com tier >= 1 e não congelada pode se oferecer "
    "como nó de liquidez, ajudando outras a trocar fio por material.",
)
def set_disponibilidade(
    payload: DisponibilidadeRequest,
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    if payload.disponivel and not pode_ser_ponto_troca(current_usuaria):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Ainda não é possível se tornar um Ponto de Troca (é preciso nível 1 "
            "ou mais, e não estar com o nível pausado).",
        )
    current_usuaria.disponivel_como_ponto = payload.disponivel
    db.commit()
    return {"disponivel": current_usuaria.disponivel_como_ponto}


@router.get(
    "/pontos-de-troca",
    response_model=list[PontoDeTrocaResponse],
    summary="Listar Pontos de Troca disponíveis",
    description="Lista outras usuárias que se ofereceram como nó de liquidez. "
    "Nunca expõe a chave de carteira nem dados internos.",
)
def listar_pontos(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    pontos = (
        db.query(Usuaria)
        .filter(
            Usuaria.disponivel_como_ponto.is_(True),
            Usuaria.id != current_usuaria.id,
            Usuaria.tier_congelado.is_(False),
        )
        .order_by(Usuaria.trocas_como_ponto_concluidas.desc())
        .all()
    )
    return pontos


@router.post(
    "/trocas",
    response_model=TrocaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Solicitar uma troca (trocar fio por material via um Ponto de Troca)",
    description="Cria uma invoice na carteira do Ponto de Troca e paga a partir "
    "da carteira da própria solicitante — pagamento Lightning real entre as "
    "duas usuárias, sem depender de nenhum PSP externo.",
)
def criar_troca(
    payload: TrocaCreateRequest,
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    ponto = (
        db.query(Usuaria)
        .filter(Usuaria.identificador == payload.ponto_identificador)
        .first()
    )
    if not ponto:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ponto de Troca não encontrado")
    if ponto.id == current_usuaria.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Você não pode fazer uma troca consigo mesma")
    if not ponto.disponivel_como_ponto or ponto.tier_congelado:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esse Ponto de Troca não está disponível no momento")

    troca = Troca(
        solicitante_id=current_usuaria.id,
        ponto_id=ponto.id,
        valor_sats=payload.valor_sats,
        status="pendente",
    )
    db.add(troca)
    db.flush()

    try:
        invoice = lnbits.create_invoice(
            ponto.lnbits_wallet_key, payload.valor_sats, "vale de produção"
        )
        troca.invoice_id = invoice.get("payment_hash")

        if current_usuaria.lnbits_wallet_key:
            lnbits.pay_invoice(current_usuaria.lnbits_wallet_key, invoice["payment_request"])

        troca.status = "confirmada"
        troca.confirmada_em = datetime.utcnow()
        ponto.trocas_como_ponto_concluidas += 1
    except Exception:
        troca.status = "falhou"

    db.commit()
    db.refresh(troca)

    return TrocaResponse(
        id=troca.id,
        valor_sats=troca.valor_sats,
        status=troca.status,
        criado_em=troca.criado_em,
        confirmada_em=troca.confirmada_em,
        papel="solicitante",
        contraparte_identificador=ponto.identificador,
    )


@router.get(
    "/trocas/minhas",
    response_model=list[TrocaResponse],
    summary="Minhas trocas (como solicitante e como Ponto de Troca)",
)
def minhas_trocas(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    solicitadas = (
        db.query(Troca).filter(Troca.solicitante_id == current_usuaria.id).all()
    )
    recebidas = (
        db.query(Troca).filter(Troca.ponto_id == current_usuaria.id).all()
    )

    result = [
        TrocaResponse(
            id=t.id,
            valor_sats=t.valor_sats,
            status=t.status,
            criado_em=t.criado_em,
            confirmada_em=t.confirmada_em,
            papel="solicitante",
            contraparte_identificador=t.ponto.identificador,
        )
        for t in solicitadas
    ] + [
        TrocaResponse(
            id=t.id,
            valor_sats=t.valor_sats,
            status=t.status,
            criado_em=t.criado_em,
            confirmada_em=t.confirmada_em,
            papel="ponto",
            contraparte_identificador=t.solicitante.identificador,
        )
        for t in recebidas
    ]
    result.sort(key=lambda t: t.criado_em, reverse=True)
    return result
