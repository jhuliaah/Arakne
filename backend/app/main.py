"""FastAPI application entry point for the Arakne backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.models import (  # noqa: F401 — import so tables are registered
    Usuaria,
    Sessao,
    Padrao,
    ProgressoPadrao,
    Emprestimo,
    Aval,
)
from app.routers import avais, auth, emprestimos, health, usuarias

# Create all tables on startup (for dev / hackathon demo).
# Migration strategy: SQLAlchemy create_all() — documented in README.md.
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Arakne API",
    description="Backend API for Arakne — crochet learning + microcredit platform.",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://10.10.30.200:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(usuarias.router)
app.include_router(avais.router)
app.include_router(emprestimos.router)


@app.get("/")
def root():
    return {"app": "Arakne", "version": "0.3.0"}
