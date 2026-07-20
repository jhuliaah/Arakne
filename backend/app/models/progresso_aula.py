"""ProgressoAula model — per-user completion state of an Aula.

Educational only: no side effects on Padrao/ProgressoPadrao/tier/saldo.
UNIQUE(usuaria_id, aula_id) ensures idempotent completion.
"""

from sqlalchemy import (
    Column,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)

from app.models.base import Base


class ProgressoAula(Base):
    __tablename__ = "progresso_aulas"
    __table_args__ = (
        UniqueConstraint("usuaria_id", "aula_id", name="uq_progresso_usuaria_aula"),
    )

    id = Column(Integer, primary_key=True, index=True)
    usuaria_id = Column(Integer, ForeignKey("usuarias.id"), nullable=False, index=True)
    aula_id = Column(Integer, ForeignKey("aulas.id"), nullable=False, index=True)
    concluida = Column(Boolean, default=False, nullable=False)
    concluida_em = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<ProgressoAula usuaria={self.usuaria_id} "
            f"aula={self.aula_id} concluida={self.concluida}>"
        )
