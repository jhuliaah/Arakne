"""Router for Usuaria endpoints.

Covers:
- POST /usuarias — create a pseudonymous account (with optional npub + invite code)
- GET /usuarias/me — current user data
- GET /usuarias/me/convite — invite link (tier 3+)
- GET /usuarias/me/avalistas-recuperacao — recovery avalistas (auth)
- GET /usuarias/by-identificador/{id}/npub — public npub lookup (no auth)
- GET /usuarias/by-identificador/{id}/avalistas-recuperacao — public recovery
  avalistas lookup (no auth; npub is public by design)
"""

import secrets

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
from app.models.avalista_recuperacao import AvalistaRecuperacao
from app.models.usuaria import Usuaria
from app.schemas.avalista_recuperacao import (
    AvalistasRecuperacaoListResponse,
    AvalistaRecuperacaoOut,
    NpubPublicoResponse,
)
from app.schemas.usuaria import ConviteResponse, UsuariaCreate, UsuariaResponse
from app.services.lnbits import lnbits
from app.services.risco import ao_receber_aval, pode_avalizar

router = APIRouter(prefix="/usuarias", tags=["usuarias"])


# ── Helpers ───────────────────────────────────────────────────

def _generate_shadow_npub() -> str:
    """Generate a placeholder npub for a shadow avalista.

    The backend does NOT generate real Nostr keys — that is the frontend's
    responsibility. For shadow slots (auto-shadow strategy, T=2 N=3), we
    generate a random 64-char hex string that the frontend will later
    replace with a real npub when it creates the shadow wallet. The hex
    is 32 bytes (64 hex chars), matching the size of a real Nostr pubkey.
    """
    return secrets.token_hex(32)


def _create_recovery_shadows(
    db: Session,
    usuaria: Usuaria,
    referrer: Usuaria | None,
) -> None:
    """Auto-create the 3 recovery avalista slots for a new usuária.

    Strategy (auto-shadow, T=2 N=3):
      - Slot 1: the convidadora's npub, if available. If the convidadora has
        no npub (e.g. legacy usuária), slot 1 also becomes a shadow.
      - Slots 2 and 3: always shadows (placeholder npub, nsec discarded by
        the frontend at creation time).
    """
    slots: list[tuple[int, str, bool]] = []

    if referrer is not None and referrer.npub:
        slots.append((1, referrer.npub, False))
    else:
        slots.append((1, _generate_shadow_npub(), True))

    slots.append((2, _generate_shadow_npub(), True))
    slots.append((3, _generate_shadow_npub(), True))

    for ordem, npub, is_shadow in slots:
        db.add(
            AvalistaRecuperacao(
                usuaria_id=usuaria.id,
                npub_avaliadora=npub,
                ordem=ordem,
                is_shadow=is_shadow,
            )
        )


# ── Endpoints ─────────────────────────────────────────────────

@router.post(
    "",
    response_model=UsuariaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar nova usuária",
    description="Cria uma conta pseudônima — só pede um PIN, nenhum dado de identidade real. "
    "Se codigo_indicacao for fornecido, cria o Aval automaticamente e libera tier 1. "
    "O npub (chave pública Nostr) é opcional e usado para recuperação social via Nostr. "
    "No cadastro, 3 slots de avalistas de recuperação são criados automaticamente "
    "(estratégia auto-shadow: 1 convidadora + 2 shadows, ou 3 shadows se a convidadora "
    "não tiver npub).",
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

    # Validate npub uniqueness if provided
    if payload.npub:
        existing = (
            db.query(Usuaria).filter(Usuaria.npub == payload.npub).first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="npub já cadastrado para outra usuária",
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
        npub=payload.npub,
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

    # Auto-create the 3 recovery avalista slots (auto-shadow strategy)
    _create_recovery_shadows(db, usuaria, referrer)

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


@router.get(
    "/me/avalistas-recuperacao",
    response_model=AvalistasRecuperacaoListResponse,
    summary="Listar avalistas de recuperação da usuária logada",
    description="Retorna os 3 slots de avalistas de recuperação (M-of-N, T=2 N=3) "
    "da usuária autenticada. Cada slot tem um npub e um flag is_shadow. "
    "Usado pelo frontend para saber para quais npubs enviar pedidos NIP-17 "
    "de recuperação de shares SSSS.",
)
def get_my_avalistas_recuperacao(
    current_usuaria: Usuaria = Depends(get_current_usuaria),
    db: Session = Depends(get_db),
):
    avalistas = (
        db.query(AvalistaRecuperacao)
        .filter(AvalistaRecuperacao.usuaria_id == current_usuaria.id)
        .order_by(AvalistaRecuperacao.ordem)
        .all()
    )
    return AvalistasRecuperacaoListResponse(
        avalistas=[AvalistaRecuperacaoOut.model_validate(a) for a in avalistas]
    )


@router.get(
    "/by-identificador/{identificador}/npub",
    response_model=NpubPublicoResponse,
    summary="Descobrir npub público de uma usuária pelo identificador",
    description="Retorna o npub (chave pública Nostr) de uma usuária a partir do "
    "seu identificador. NÃO requer autenticação — npub é público por design "
    "(é uma chave pública). Usado por um novo dispositivo que sabe apenas o "
    "identificador da conta para descobrir o npub e iniciar a recuperação social.",
)
def get_npub_by_identificador(
    identificador: str,
    db: Session = Depends(get_db),
):
    usuaria = (
        db.query(Usuaria)
        .filter(Usuaria.identificador == identificador)
        .first()
    )
    if not usuaria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuária não encontrada",
        )
    return NpubPublicoResponse(
        identificador=usuaria.identificador,
        npub=usuaria.npub,
    )


@router.get(
    "/by-identificador/{identificador}/avalistas-recuperacao",
    response_model=AvalistasRecuperacaoListResponse,
    summary="Descobrir avalistas de recuperação de uma usuária pelo identificador",
    description="Retorna a lista de avalistas de recuperação (npub de cada slot) "
    "de uma usuária a partir do seu identificador. NÃO requer autenticação — "
    "npub é público. Usado por um novo dispositivo que sabe apenas o "
    "identificador da conta para descobrir para quais npubs enviar pedidos "
    "NIP-17 de recuperação de shares SSSS.",
)
def get_avalistas_recuperacao_by_identificador(
    identificador: str,
    db: Session = Depends(get_db),
):
    usuaria = (
        db.query(Usuaria)
        .filter(Usuaria.identificador == identificador)
        .first()
    )
    if not usuaria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuária não encontrada",
        )
    avalistas = (
        db.query(AvalistaRecuperacao)
        .filter(AvalistaRecuperacao.usuaria_id == usuaria.id)
        .order_by(AvalistaRecuperacao.ordem)
        .all()
    )
    return AvalistasRecuperacaoListResponse(
        avalistas=[AvalistaRecuperacaoOut.model_validate(a) for a in avalistas]
    )
