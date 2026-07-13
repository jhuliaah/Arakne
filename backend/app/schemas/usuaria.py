"""Pydantic schemas for the Usuaria entity."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UsuariaCreate(BaseModel):
    """Request body for POST /usuarias — only a PIN, no real identity."""

    pin: str = Field(
        ...,
        min_length=4,
        max_length=32,
        description="PIN ou senha local (mínimo 4 caracteres)",
    )
    codigo_indicacao: Optional[str] = Field(
        None,
        description="Código de indicação de outra usuária (opcional)",
    )


class UsuariaResponse(BaseModel):
    """Response model — never exposes pin_hash, avalista_id, or internal id."""

    model_config = ConfigDict(from_attributes=True)

    identificador: str
    codigo_indicacao: str
    codigo_indicacao_usado: Optional[str]
    tier: int
    saldo_devedor: int
    tier_congelado: bool
    padroes_completos: int
    criado_em: datetime
