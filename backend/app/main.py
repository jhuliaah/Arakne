"""FastAPI application entry point for the Arakne backend."""

from fastapi import FastAPI

from app.database import Base, engine
from app.models import (  # noqa: F401 — import so tables are registered
    Usuaria,
    Padrao,
    ProgressoPadrao,
    Emprestimo,
    Aval,
)
from app.routers import health

# Create all tables on startup (for dev / hackathon demo)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Arakne API",
    description="Backend API for Arakne — crochet learning + microcredit platform.",
    version="0.1.0",
)

app.include_router(health.router)


@app.get("/")
def root():
    return {"app": "Arakne", "version": "0.1.0"}
