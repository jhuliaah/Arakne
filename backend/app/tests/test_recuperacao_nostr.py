"""Testes de integração dos endpoints de recuperação Nostr (Track 1A, Fase 1).

Cobre:
- POST /usuarias com npub → persiste npub
- GET /usuarias/me retorna npub
- POST /usuarias sem npub → npub é null
- POST /usuarias com npub duplicado → 400
- Cadastro cria 3 slots de avalistas de recuperação automaticamente
- GET /usuarias/me/avalistas-recuperacao (auth) retorna 3 slots
- GET /usuarias/by-identificador/{id}/npub (sem auth) retorna npub
- GET /usuarias/by-identificador/{id}/avalistas-recuperacao (sem auth) retorna lista
- Convidadora com npub → slot 1 é a convidadora (is_shadow=False)
- Convidadora sem npub → slot 1 é shadow
"""

from app.models.avalista_recuperacao import AvalistaRecuperacao
from app.models.usuaria import Usuaria


# ── Helpers ──────────────────────────────────────────────────

def _criar_usuaria(client, pin="1234", npub=None, codigo_indicacao=None):
    """Cria uma usuária via API e retorna o JSON de resposta."""
    body = {"pin": pin}
    if npub is not None:
        body["npub"] = npub
    if codigo_indicacao is not None:
        body["codigo_indicacao"] = codigo_indicacao
    resp = client.post("/usuarias", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _login(client, identificador, pin="1234"):
    resp = client.post("/login", json={
        "identificador": identificador,
        "pin": pin,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


# ── Testes de npub no cadastro ────────────────────────────────

def test_cadastro_com_npub_persiste_npub(client, db_session):
    """POST /usuarias com npub → npub é persistido e retornado."""
    npub = "a" * 64
    u = _criar_usuaria(client, npub=npub)
    assert u["npub"] == npub

    # GET /usuarias/me também retorna o npub
    token = _login(client, u["identificador"])
    resp = client.get("/usuarias/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["npub"] == npub


def test_cadastro_sem_npub_deixa_npub_null(client, db_session):
    """POST /usuarias sem npub → npub é null (retrocompatível)."""
    u = _criar_usuaria(client)
    assert u["npub"] is None


def test_cadastro_com_npub_duplicado_rejeita(client, db_session):
    """POST /usuarias com npub já cadastrado → 400."""
    npub = "b" * 64
    _criar_usuaria(client, npub=npub)
    resp = client.post("/usuarias", json={"pin": "5678", "npub": npub})
    assert resp.status_code == 400
    assert "npub" in resp.json()["detail"].lower()


# ── Testes de avalistas de recuperação no cadastro ───────────

def test_cadastro_cria_3_slots_de_recuperacao(client, db_session):
    """Cadastro sem convidadora → 3 slots, todos shadow."""
    u = _criar_usuaria(client)

    # Use the authed endpoint to verify
    token = _login(client, u["identificador"])
    resp = client.get(
        "/usuarias/me/avalistas-recuperacao",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["avalistas"]) == 3
    ordens = [a["ordem"] for a in data["avalistas"]]
    assert sorted(ordens) == [1, 2, 3]
    # Sem convidadora → todos shadow
    assert all(a["is_shadow"] is True for a in data["avalistas"])
    # Todos têm npub (placeholder hex de 64 chars)
    for a in data["avalistas"]:
        assert a["npub_avaliadora"]
        assert len(a["npub_avaliadora"]) >= 32


def test_cadastro_com_convidadora_com_npub_slot1_eh_convidadora(client, db_session):
    """Convidadora com npub → slot 1 é a convidadora (is_shadow=False)."""
    # 1. Convidadora com npub
    convidadora = _criar_usuaria(client, npub="c" * 64)
    # Promover para tier 3 para poder convidar (não necessário para o fluxo
    # de cadastro, mas garante consistência com o motor de risco)
    usuaria_c = (
        db_session.query(Usuaria)
        .filter(Usuaria.identificador == convidadora["identificador"])
        .first()
    )
    usuaria_c.tier = 3
    db_session.commit()

    # 2. Nova usuária com o codigo_indicacao da convidadora
    nova = _criar_usuaria(
        client,
        pin="5678",
        npub="d" * 64,
        codigo_indicacao=convidadora["codigo_indicacao"],
    )

    # 3. Slot 1 deve ser a convidadora (is_shadow=False, npub da convidadora)
    token = _login(client, nova["identificador"], pin="5678")
    resp = client.get(
        "/usuarias/me/avalistas-recuperacao",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    avalistas = resp.json()["avalistas"]
    assert len(avalistas) == 3
    slot1 = next(a for a in avalistas if a["ordem"] == 1)
    assert slot1["is_shadow"] is False
    assert slot1["npub_avaliadora"] == "c" * 64
    # Slots 2 e 3 são shadows
    slot2 = next(a for a in avalistas if a["ordem"] == 2)
    slot3 = next(a for a in avalistas if a["ordem"] == 3)
    assert slot2["is_shadow"] is True
    assert slot3["is_shadow"] is True


def test_cadastro_com_convidadora_sem_npub_slot1_eh_shadow(client, db_session):
    """Convidadora sem npub → slot 1 também é shadow."""
    convidadora = _criar_usuaria(client)  # sem npub
    usuaria_c = (
        db_session.query(Usuaria)
        .filter(Usuaria.identificador == convidadora["identificador"])
        .first()
    )
    usuaria_c.tier = 3
    db_session.commit()

    nova = _criar_usuaria(
        client,
        pin="5678",
        codigo_indicacao=convidadora["codigo_indicacao"],
    )

    token = _login(client, nova["identificador"], pin="5678")
    resp = client.get(
        "/usuarias/me/avalistas-recuperacao",
        headers={"Authorization": f"Bearer {token}"},
    )
    avalistas = resp.json()["avalistas"]
    assert len(avalistas) == 3
    assert all(a["is_shadow"] is True for a in avalistas)


# ── Testes de descoberta pública (sem auth) ──────────────────

def test_get_npub_by_identificador_sem_auth(client, db_session):
    """GET /usuarias/by-identificador/{id}/npub (sem auth) retorna npub."""
    npub = "e" * 64
    u = _criar_usuaria(client, npub=npub)

    resp = client.get(f"/usuarias/by-identificador/{u['identificador']}/npub")
    assert resp.status_code == 200
    data = resp.json()
    assert data["identificador"] == u["identificador"]
    assert data["npub"] == npub


def test_get_npub_by_identificador_sem_npub_retorna_null(client, db_session):
    """Usuária sem npub → endpoint público retorna npub=null."""
    u = _criar_usuaria(client)
    resp = client.get(f"/usuarias/by-identificador/{u['identificador']}/npub")
    assert resp.status_code == 200
    assert resp.json()["npub"] is None


def test_get_npub_by_identificador_inexistente_404(client, db_session):
    """Identificador inexistente → 404."""
    resp = client.get("/usuarias/by-identificador/nao_existe/npub")
    assert resp.status_code == 404


def test_get_avalistas_recuperacao_by_identificador_sem_auth(client, db_session):
    """GET /usuarias/by-identificador/{id}/avalistas-recuperacao (sem auth)."""
    u = _criar_usuaria(client, npub="f" * 64)
    resp = client.get(
        f"/usuarias/by-identificador/{u['identificador']}/avalistas-recuperacao"
    )
    assert resp.status_code == 200
    avalistas = resp.json()["avalistas"]
    assert len(avalistas) == 3
    assert sorted(a["ordem"] for a in avalistas) == [1, 2, 3]


def test_get_avalistas_recuperacao_by_identificador_inexistente_404(client, db_session):
    resp = client.get(
        "/usuarias/by-identificador/nao_existe/avalistas-recuperacao"
    )
    assert resp.status_code == 404


# ── Teste de auth no endpoint /me/avalistas-recuperacao ──────

def test_get_my_avalistas_recuperacao_sem_auth_401(client, db_session):
    """GET /usuarias/me/avalistas-recuperacao sem token → 401."""
    resp = client.get("/usuarias/me/avalistas-recuperacao")
    assert resp.status_code == 401
