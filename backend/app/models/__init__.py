"""Import all models so SQLAlchemy registers them on the Base metadata."""

from app.models.base import Base  # noqa: F401
from app.models.usuaria import Usuaria  # noqa: F401
from app.models.sessao import Sessao  # noqa: F401
from app.models.padrao import Padrao  # noqa: F401
from app.models.progresso import ProgressoPadrao  # noqa: F401
from app.models.emprestimo import Emprestimo  # noqa: F401
from app.models.aval import Aval  # noqa: F401
from app.models.troca import Troca  # noqa: F401

__all__ = [
    "Base",
    "Usuaria",
    "Sessao",
    "Padrao",
    "ProgressoPadrao",
    "Emprestimo",
    "Aval",
    "Troca",
]
