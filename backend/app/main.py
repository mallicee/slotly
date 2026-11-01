from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .api import admin, public
from .db import SessionLocal, engine
from .models import Base, Service
from .scheduling import business_now
from .seed import seed_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if os.getenv("SEED_DEMO", "1") == "1":
        with SessionLocal() as db:
            if not db.scalar(select(func.count()).select_from(Service)):
                seed_all(db, business_now().date())
                logging.getLogger("slotly").info("Seeded demo data")
    yield


app = FastAPI(title="Slotly API", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(public)
app.include_router(admin)


@app.get("/health", include_in_schema=False)
def health():
    return {"ok": True}
