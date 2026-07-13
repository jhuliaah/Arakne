"""Usuaria model — the core user entity of Arakne."""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Usuaria(Base):
    __tablename__ = "usuarias"

    id = Column(Integer, primary_key=True, index=True)
    codigo_indicacao_usado = Column(String, nullable=True)
    tier = Column(Integer, default=0, nullable=False)
    saldo_devedor = Column(Integer, default=0, nullable=False)  # in sats
    tier_congelado = Column(Boolean, default=False, nullable=False)
    avalista_id = Column(Integer, ForeignKey("usuarias.id"), nullable=True)
    padroes_completos = Column(Integer, default=0, nullable=False)
    criado_em = Column(DateTime, server_default=func.now(), nullable=False)

    avalista = relationship(
        "Usuaria",
        remote_side=[id],
        backref="avalizados",
        foreign_keys=[avalista_id],
    )

    def __repr__(self) -> str:
        return f"<Usuaria id={self.id} tier={self.tier} congelado={self.tier_congelado}>"
