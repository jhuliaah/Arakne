"""Pydantic schemas for the AvalistaRecuperacao entity.

These are used by the Nostr-based social recovery flow (Track 1A, Fase 1).
The backend only persists and exposes the npub of each recovery avalista;
the actual NIP-17/59 + SSSS logic lives in the frontend.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AvalistaRecuperacaoOut(BaseModel):
    """One recovery avalista slot for a usuária."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    usuaria_id: int
    npub_avaliadora: str
    ordem: int
    is_shadow: bool
    criado_em: datetime


class AvalistasRecuperacaoListResponse(BaseModel):
    """List of recovery avalistas for a usuária (M-of-N, typically N=3)."""

    avalistas: List[AvalistaRecuperacaoOut]


class NpubPublicoResponse(BaseModel):
    """Public npub of a usuária, lookup by identificador.

    npub is intentionally public — any device can discover it to send NIP-17
    recovery requests. No auth required.
    """

    identificador: str
    npub: Optional[str]
