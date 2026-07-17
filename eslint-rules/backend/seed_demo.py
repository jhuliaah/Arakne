#!/usr/bin/env python3
"""Arakne — Script de seed para a demo do júri.

Reseta o banco SQLite e cria a Usuária A pronta para o roteiro:
- Tier 1 (recebeu 1 aval)
- Saldo devedor zerado
- Não congelada
- Wallet LNbits mock criada
- código_indicacao disponível para o convite da Usuária B

Uso:
    cd backend
    python seed_demo.py

A Usuária B NÃO é criada aqui — ela será criada ao vivo na demo,
pelo link de indicação da Usuária A.
"""

import os
import sys

# Ensure we can import from app/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Aval,
    Emprestimo,
    Padrao,
    ProgressoPadrao,
    Sessao,
    Usuaria,
)
from app.auth import hash_pin  # noqa: E402


def reset_database():
    """Drop all tables and recreate them fresh."""
    print("[seed] Resetando banco de dados...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("[seed] ✓ Tabelas recriadas.")


def seed_usuaria_a():
    """Create Usuária A — tier 1, 1 aval received, zero balance.

    We need two users to create an Aval:
    - A "seed avalista" (tier 3, shadow user) that gives the aval to A
    - Usuária A herself (tier 1 after receiving the aval)

    The seed avalista is a throwaway account that exists only so the
    motor de risco can validate A's eligibility.
    """
    db = SessionLocal()
    try:
        # ── Shadow avalista (gives aval to A) ───────────────────
        shadow = Usuaria(
            identificador="shadow_avalista_seed",
            pin_hash=hash_pin("0000"),
            lnbits_wallet_key="mock_shadow_key",
            codigo_indicacao="shadow_seed_code",
            tier=3,  # tier 3 so pode_avalizar would pass
            saldo_devedor=0,
            tier_congelado=False,
            padroes_completos=0,
        )
        db.add(shadow)
        db.flush()

        # ── Usuária A — the demo user ──────────────────────────
        usuaria_a = Usuaria(
            identificador="demo_usuaria_a",
            pin_hash=hash_pin("1234"),
            lnbits_wallet_key="mock_wallet_a",
            codigo_indicacao="DEMO_A_INVITE",
            codigo_indicacao_usado=None,
            tier=1,  # already tier 1 (received aval)
            saldo_devedor=0,
            tier_congelado=False,
            padroes_completos=0,
        )
        db.add(usuaria_a)
        db.flush()

        # ── Aval: shadow → A ───────────────────────────────────
        aval = Aval(
            usuaria_que_avaliza_id=shadow.id,
            nova_usuaria_id=usuaria_a.id,
        )
        db.add(aval)

        db.commit()

        print(f"[seed] ✓ Usuária A criada:")
        print(f"         identificador:  {usuaria_a.identificador}")
        print(f"         PIN:            1234")
        print(f"         tier:           {usuaria_a.tier}")
        print(f"         saldo_devedor:  {usuaria_a.saldo_devedor}")
        print(f"         congelado:      {usuaria_a.tier_congelado}")
        print(f"         convite (B):    /convite/{usuaria_a.codigo_indicacao}")
        print(f"")
        print(f"[seed] ✓ Shadow avalista criada (tier 3, descartável)")
        print(f"")
        print(f"[seed] Banco pronto para a demo!")
        print(f"")
        print(f"  Roteiro do júri:")
        print(f"  1. Abrir http://localhost:5173/convite/DEMO_A_INVITE")
        print(f"     → Usuária B é criada + aval automático → tier 1")
        print(f"  2. Digitar 'Ponto Arakne' na busca → tela 'Meus Materiais'")
        print(f"  3. Clicar 'Solicitar Kit de Material' → empréstimo de 5.000")
        print(f"  4. Clicar 'Concluir Padrão' → pagar 2.000 (parcial)")
        print(f"  5. Clicar 'Concluir Padrão' → pagar 3.000 (restante)")
        print(f"  6. Tier sobe de 1 → 2 em tempo real")
    finally:
        db.close()


if __name__ == "__main__":
    reset_database()
    seed_usuaria_a()
