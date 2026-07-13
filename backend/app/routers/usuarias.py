"""Router for Usuaria endpoints — POST /usuarias, GET /usuarias/me, GET /usuarias/me/convite."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    generate_codigo_indicacao,
    generate_identificador,
    get_current_usuaria,
    hash_pin,
)
from app.database import get_db
from app.models.aval import Aval
from app.models.usuaria import Usuaria
from app.schemas.usuaria import ConviteResponse, UsuariaCreate, UsuariaResponse
from app.services.lnbits import lnbits
from app.services.risco import ao_receber_aval, pode_avalizar

router = APIRouter(prefix="/usuarias", tags=["usuarias"])


@router.post(
    "",
    response_model=UsuariaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nova usuária",
    description="Cria uma conta pseudônima — só pede um PIN, nenhum dado de identidade real. "
    "Se codigo_indicacao for fornecido, cria o Aval automaticamente e libera tier 1.",
)
def create_usuaria(
    payload: UsuariaCreate,
    db: Session = Depends(get_db),
):
    referrer: Usuaria | None = None

    # Validate referral code if provided
    if payload.codigo_indicacao:
        referrer = (
            db.query(Usuaria)
            .filter(Usuaria.codigo_indicacao == payload.codigo_indicacao)
            .first()
        )
        if not referrer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Código de indicação inválido",
            )

    # Generate unique identificador (retry on collision)
    identificador = generate_identificador()
    while db.query(Usuaria).filter(Usuaria.identificador == identificador).first():
        identificador = generate_identificador()

    # Generate unique codigo_indicacao (retry on collision)
    codigo = generate_codigo_indicacao()
    while db.query(Usuaria).filter(Usuaria.codigo_indicacao == codigo).first():
        codigo = generate_codigo_indicacao()

    # Create dedicated LNbits wallet for this user
    wallet = lnbits.create_wallet(f"usuaria_{identificador}")

    usuaria = Usuaria(
        identificador=identificador,
        pin_hash=hash_pin(payload.pin),
        lnbits_wallet_key=wallet["adminkey"],
        codigo_indicacao=codigo,
        codigo_indicacao_usado=payload.codigo_indicacao,
    )
    db.add(usuaria)
    db.flush()  # get the id without committing yet

    # If a referral code was provided, create the Aval automatically
    if referrer:
        aval = Aval(
            usuaria_que_avaliza_id=referrer.id,
            nova_usuaria_id=usuaria.id,
        )
        db.add(aval)
        usuaria.avalista_id = referrer.id
        ao_receber_aval(usuaria)  # tier 0 → 1

    db.commit()
    db.refresh(usuaria)
    return usuaria


@router.get(
    "/me",
    response_model=UsuariaResponse,
    summary="Dados da própria usuária",
    description="Retorna os dados da usuária autenticada. Nunca expõe pin_hash, avalista_id, ou id interno.",
)
def get_me(current_usuaria: Usuaria = Depends(get_current_usuaria)):
    return current_usuaria


@router.get(
    "/me/convite",
    response_model=ConviteResponse,
    summary="Gerar link de convite (disponível apenas para nível 3+)",
    description="Retorna o código de indicação da usuária e o link de convite. "
    "Apenas usuárias em tier 3 ou superior podem gerar convites.",
)
def get_convite(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
):
    if not pode_avalizar(current_usuaria):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Convites disponíveis apenas a partir do nível 3",
        )

    codigo = current_usuaria.codigo_indicacao
    link = f"/convite/{codigo}"
    return ConviteResponse(codigo=codigo, link=link)
