"""Router for custódia (reserva fria multisig) — somente leitura, de propósito.

Não existe rota de escrita aqui. Registrar uma nova reserva fria (ou uma
rotação de chaves) é um passo fora de banda — rodar scripts/gerar_multisig.py
e inserir a linha manualmente — porque isso não é algo que a aplicação deva
poder fazer sozinha via API (ver seção 6 do doc mestre: "nenhuma parte
sozinha move fundos", e isso vale também pra quem registra o que é a
reserva fria oficial).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.custodia import CustodiaMultisig
from app.schemas.custodia import CustodiaMultisigResponse, CustodiaMultisigVazia

router = APIRouter(prefix="/custodia", tags=["custodia"])


@router.get(
    "/reserva-fria",
    response_model=CustodiaMultisigResponse | CustodiaMultisigVazia,
    summary="Dados públicos da reserva fria multisig ativa",
    description="Descriptor e endereço público da custódia compartilhada. "
    "Nunca inclui chave privada — essas ficam só com cada steward.",
)
def get_reserva_fria(db: Session = Depends(get_db)):
    atual = (
        db.query(CustodiaMultisig)
        .filter(CustodiaMultisig.ativo.is_(True))
        .order_by(CustodiaMultisig.criado_em.desc())
        .first()
    )
    if not atual:
        return CustodiaMultisigVazia()
    return atual
