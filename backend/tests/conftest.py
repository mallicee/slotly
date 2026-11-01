from __future__ import annotations

import os
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256")
os.environ["SEED_DEMO"] = "0"

from app import api  # noqa: E402
from app.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.seed import load_catalog, seed_admin, seed_catalog  # noqa: E402

# Monday, 2 November 2026, 09:00 business time.
NOW = datetime(2026, 11, 2, 9, 0)


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as db:
        catalog = load_catalog()
        seed_catalog(db, catalog)
        seed_admin(db, catalog)
        db.commit()
    yield Session
    engine.dispose()


@pytest.fixture
def client(db_session, monkeypatch):
    def override():
        with db_session() as db:
            yield db

    app.dependency_overrides[get_db] = override
    monkeypatch.setattr(api, "business_now", lambda: NOW)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def token(client):
    catalog = load_catalog()
    r = client.post("/api/auth/login", json=catalog["demoAdmin"])
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}"}
