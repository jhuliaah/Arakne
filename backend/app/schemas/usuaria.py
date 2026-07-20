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
    npub: Optional[str] = Field(
        None,
        description="Chave pública Nostr (npub) da usuária — usada para "
        "recuperação social via Nostr. O frontend gera o par nsec/npub; "
        "o backend apenas recebe e guarda o npub.",
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
    disponivel_como_ponto: bool
    trocas_como_ponto_concluidas: int
    criado_em: datetime
    npub: Optional[str] = None


class NpubUpdate(BaseModel):
    """Request body for PATCH /usuarias/me/npub — atualiza o npub da usuária."""

    npub: str = Field(
        ...,
        min_length=10,
        description="Chave pública Nostr (npub1... ou hex de 64 chars) da "
        "usuária. Usado pela página de setup da demo para definir o npub "
        "da Fundadora após a geração do par nsec/npub no frontend.",
    )


class ConviteResponse(BaseModel):
    """Response for GET /usuarias/me/convite — invite link data."""

    codigo: str
    link: str
