"""Router for /carteira endpoints — a carteira interna da usuária
(off-ramp sats → BRL via Pix).

Diferente de /pix (que é o rail de repagamento de empréstimo), /carteira é
o dia-a-dia da usuária: ver saldo, ver cotação, depositar (Pix → sats na
carteira), pagar comerciante (sats → Pix pro comerciante), e gerar cobrança
pra quitar empréstimo (atalho pra o frontend ter tudo num lugar só).

Disfarce: na UI, "carteira" aparece como "caixinha de materiais" ou
similar. Os nomes técnicos aqui na API são de propósito — a camada de
disfarce é responsabilidade do frontend.
"""

import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import _naive_utc, get_current_usuaria
from app.database import get_db
from app.models.emprestimo import Emprestimo
from app.models.pagamento_pix import PagamentoPix
from app.models.transacao_carteira import TransacaoCarteira
from app.models.usuaria import Usuaria
from app.schemas.carteira import (
    CotacaoResponse,
    DepositarRequest,
    DepositarResponse,
    GerarQuitacaoRequest,
    GerarQuitacaoResponse,
    PagarRequest,
    PagarResponse,
    SaldoResponse,
    TransacaoCarteiraResponse,
)
from app.services.exchange import exchange
from app.services.lnbits import lnbits
from app.services.pix import pix

router = APIRouter(prefix="/carteira", tags=["carteira"])

# Saldo mock de demo (em sats) — usado quando a usuária não tem wallet LNbits
# configurada (ex.: conta criada antes do campo lnbits_wallet_key existir).
_SALDO_MOCK_SATS = 50_000


def _gerar_txid_carteira(usuaria_id: int) -> str:
    """txid único pra cobranças Pix da carteira — mesmo padrão do router
    /pix, mas prefixado pra distinguir no webhook."""
    return f"arakne-cart-{usuaria_id}-{secrets.token_hex(6)}"


def _saldo_sats_da_usuaria(usuaria: Usuaria) -> int:
    """Consulta o saldo da usuária em sats via LNbits. Se ela não tem
    wallet key (ou LNbits está em mock), devolve o saldo de demo."""
    if not usuaria.lnbits_wallet_key:
        return _SALDO_MOCK_SATS
    balance = lnbits.get_wallet_balance(usuaria.lnbits_wallet_key)
    # LNbits devolve millisatoshis; converte pra sats.
    return balance.get("balance_msats", 0) // 1000


@router.get(
    "/cotacao",
    response_model=CotacaoResponse,
    summary="Cotação atual BTC/BRL",
    description="Retorna o preço atual de 1 BTC em BRL (cotação pública da "
    "Binance). Base pra toda conversão sats↔BRL da carteira.",
)
def get_cotacao(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
):
    cotacao = exchange.cotacao_btc_brl()
    return CotacaoResponse(
        btc_brl=float(cotacao["price"]),
        atualizado_em=_naive_utc(datetime.now(UTC)),
    )


@router.get(
    "/saldo",
    response_model=SaldoResponse,
    summary="Saldo da carteira (sats + BRL)",
    description="Retorna o saldo da carteira da usuária em sats (consultado "
    "no LNbits) e convertido pra BRL pela cotação atual. Em mock mode, "
    "devolve um saldo de demo fixo.",
)
def get_saldo(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
):
    cotacao = exchange.cotacao_btc_brl()
    preco_brl = float(cotacao["price"])
    saldo_sats = _saldo_sats_da_usuaria(current_usuaria)
    saldo_brl = saldo_sats / 100_000_000 * preco_brl
    return SaldoResponse(
        saldo_sats=saldo_sats,
        saldo_brl=round(saldo_brl, 2),
        cotacao_btc_brl=preco_brl,
    )


@router.get(
    "/transacoes",
    response_model=list[TransacaoCarteiraResponse],
    summary="Extrato da carteira",
    description="Lista as transações da carteira da usuária, ordenadas pela "
    "mais recente primeiro.",
)
def list_transacoes(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    transacoes = (
        db.query(TransacaoCarteira)
        .filter(TransacaoCarteira.usuaria_id == current_usuaria.id)
        .order_by(
            TransacaoCarteira.criado_em.desc(),
            TransacaoCarteira.id.desc(),  # desempate: SQLite tem precisão de segundo
        )
        .all()
    )
    return transacoes


@router.post(
    "/depositar",
    response_model=DepositarResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Gerar cobrança Pix pra depositar na carteira",
    description="Gera uma cobrança Pix dinâmica pra a usuária depositar BRL "
    "na própria carteira. Quando o webhook do Mercado Pago confirma, o "
    "saldo da carteira é creditado (conversão BRL→sats). Não vincula a "
    "nenhum empréstimo — é depósito puro.",
)
def depositar(
    payload: DepositarRequest,
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    txid = _gerar_txid_carteira(current_usuaria.id)
    resultado = pix.criar_cobranca(
        valor_brl=payload.valor_centavos_brl / 100,
        txid=txid,
        descricao="depósito carteira",
    )

    # Registra a cobrança como PagamentoPix sem emprestimo_id — o webhook
    # do /pix vai confirmar e creditar a carteira. (PagamentoPix exige
    # emprestimo_id NOT NULL, então criamos um PagamentoPix só se der pra
    # relaxar a constraint; caso contrário, usamos só TransacaoCarteira.)
    # Decisão: TransacaoCarteira é o ledger da carteira; PagamentoPix fica
    # só pra repagamento de empréstimo. O webhook de /pix ignora txids que
    # não casam com PagamentoPix — então o depósito de carteira é confirmado
    # por polling no frontend (GET /carteira/transacoes) por enquanto.
    cotacao = exchange.cotacao_btc_brl()
    valor_sats = int(
        (payload.valor_centavos_brl / 100) / float(cotacao["price"]) * 100_000_000
    )

    transacao = TransacaoCarteira(
        usuaria_id=current_usuaria.id,
        tipo="deposito",
        valor_sats=valor_sats,
        valor_centavos_brl=payload.valor_centavos_brl,
        cotacao_btc_brl=float(cotacao["price"]),
        descricao="depósito carteira",
        contraparte=None,
        status="pendente",
    )
    db.add(transacao)
    db.commit()
    db.refresh(transacao)

    return DepositarResponse(
        txid=txid,
        qr_code=resultado["qr_code"],
        qr_code_base64=resultado["qr_code_base64"],
        ticket_url=resultado["ticket_url"],
        valor_centavos_brl=payload.valor_centavos_brl,
        status="pendente",
    )


@router.post(
    "/pagar",
    response_model=PagarResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Pagar comerciante via Pix (off-ramp sats → BRL)",
    description="Envia um Pix para uma chave Pix qualquer, debitando o "
    "saldo da carteira em sats. Só disponível para usuárias com pais=BR "
    "(Pix é um rail brasileiro). Em mock mode, aprova imediatamente.",
)
def pagar(
    payload: PagarRequest,
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    if current_usuaria.pais != "BR":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Pagamento só disponível no Brasil",
        )

    cotacao = exchange.cotacao_btc_brl()
    preco_brl = float(cotacao["price"])
    # Converte BRL → sats no momento do pagamento.
    valor_sats = int(
        (payload.valor_centavos_brl / 100) / preco_brl * 100_000_000
    )

    saldo_sats = _saldo_sats_da_usuaria(current_usuaria)
    if valor_sats > saldo_sats:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Saldo insuficiente: você tem {saldo_sats} sats, "
            f"este pagamento precisa de {valor_sats} sats",
        )

    # Envia o Pix pro comerciante. Em mock, aprova imediatamente; em real,
    # levanta MercadoPagoPixError em falha (nunca finge sucesso).
    resultado = pix.pagar_pix(
        chave_pix=payload.chave_pix,
        valor_centavos_brl=payload.valor_centavos_brl,
        descricao=payload.descricao or "pagamento carteira",
    )

    transacao = TransacaoCarteira(
        usuaria_id=current_usuaria.id,
        tipo="pagamento",
        valor_sats=-valor_sats,  # saída: negativo
        valor_centavos_brl=payload.valor_centavos_brl,
        cotacao_btc_brl=preco_brl,
        descricao=payload.descricao or "pagamento carteira",
        contraparte=payload.chave_pix,
        status="concluida" if resultado["status"] == "approved" else "pendente",
    )
    db.add(transacao)
    db.commit()
    db.refresh(transacao)

    return PagarResponse(
        id=transacao.id,
        status=transacao.status,
        valor_centavos_brl=payload.valor_centavos_brl,
        valor_sats=-valor_sats,
    )


@router.post(
    "/gerar-quitacao",
    response_model=GerarQuitacaoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Gerar cobrança Pix pra quitar (parte de) um empréstimo",
    description="Atalho no router /carteira pra o endpoint equivalente de "
    "/pix/emprestimos/{id}/cobranca — gera a cobrança Pix e registra o "
    "PagamentoPix vinculado ao empréstimo. Existe pra o frontend ter "
    "tudo relacionado a carteira num único router.",
)
def gerar_quitacao(
    payload: GerarQuitacaoRequest,
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    emprestimo = (
        db.query(Emprestimo)
        .filter(Emprestimo.id == payload.emprestimo_id)
        .first()
    )
    if not emprestimo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empréstimo não encontrado")
    if emprestimo.usuaria_id != current_usuaria.id:
        # Não vaza existência de empréstimo alheio — 404 genérico.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empréstimo não encontrado")
    if emprestimo.status == "quitado":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empréstimo já quitado")
    if payload.valor_sats > current_usuaria.saldo_devedor:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "valor_sats maior que o saldo devedor atual",
        )

    # Calcula valor_centavos_brl pela cotação atual — a carteira tem
    # cotação viva (GET /carteira/cotacao), então não pede o BRL no body
    # como o endpoint /pix/emprestimos/{id}/cobranca faz.
    cotacao = exchange.cotacao_btc_brl()
    preco_brl = float(cotacao["price"])
    valor_brl = payload.valor_sats / 100_000_000 * preco_brl
    valor_centavos_brl = max(1, int(round(valor_brl * 100)))

    txid = _gerar_txid_carteira(current_usuaria.id)
    resultado = pix.criar_cobranca(
        valor_brl=valor_centavos_brl / 100,
        txid=txid,
        descricao="padrão concluído",
    )

    pagamento = PagamentoPix(
        emprestimo_id=emprestimo.id,
        txid=txid,
        mp_payment_id=resultado["mp_payment_id"],
        valor_sats=payload.valor_sats,
        valor_centavos_brl=valor_centavos_brl,
        status="pendente",
        qr_code=resultado["qr_code"],
    )
    db.add(pagamento)
    db.commit()

    return GerarQuitacaoResponse(
        txid=txid,
        qr_code=resultado["qr_code"],
        qr_code_base64=resultado["qr_code_base64"],
        ticket_url=resultado["ticket_url"],
        valor_sats=payload.valor_sats,
        valor_centavos_brl=valor_centavos_brl,
        status="pendente",
    )
