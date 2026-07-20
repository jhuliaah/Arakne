"""Pydantic schemas for the Trilhas (learning tracks) endpoints.

Educational only — no financial coupling. Mirrors the TypeScript types in
`frontend/src/types.ts` (Trilha, Nivel, Aula, Material, TrilhaDetail,
ConcluirAulaResponse).
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    aula_id: int
    tipo: Literal["pdf", "imagem", "video"]
    url: str
    titulo: str
    ordem: int
    legenda: Optional[str] = None
    # Campos opcionais para atribuição e metadados (Passo 2 do plano de trilhas).
    licenca: Optional[str] = None
    fonte: Optional[str] = None
    duracao_seg: Optional[int] = None
    thumbnail_url: Optional[str] = None


class AulaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trilha_id: int
    nivel: int
    ordem: int
    titulo: str
    descricao: str
    concluida: bool
    materiais: List[MaterialOut] = []


class NivelOut(BaseModel):
    nivel: int
    label: str
    desbloqueado: bool
    aulas: List[AulaOut] = []


class TrilhaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    titulo: str
    tecnica: str
    estilo: str
    descricao: str
    emoji: str
    cor: str
    ordem: int
    total_aulas: int
    aulas_concluidas: int


class TrilhaDetailOut(TrilhaOut):
    niveis: List[NivelOut] = []


class ConcluirAulaResponse(BaseModel):
    aula_id: int
    concluida: bool
    nivel_completo: bool
    trilha_completa: bool
