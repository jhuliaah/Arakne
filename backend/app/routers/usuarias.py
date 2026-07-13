"""Router for Usuaria endpoints — POST /usuarias, GET /usuarias/me."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    generate_codigo_indicacao,
    generate_identificador,
    get_current_usuaria,
    hash_pin,
)
from app.database import get_db
from app.models.usuaria import Usuaria
from app.schemas.usuaria import UsuariaCreate, UsuariaResponse

router = APIRouter(prefix="/usuarias", tags=["usuarias"])


@router.post(
    "",
    response_model=UsuariaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nova usuária",
    description="Cria uma conta pseudônima — só pede um PIN, nenhum dado de identidade real.",
)
def create_usuaria(
    payload: UsuariaCreate,
    db: Session = Depends(get_db),
):
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

    usuaria = Usuaria(
        identificador=identificador,
        pin_hash=hash_pin(payload.pin),
        codigo_indicacao=codigo,
        codigo_indicacao_usado=payload.codigo_indicacao,
    )
    db.add(usuaria)
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
