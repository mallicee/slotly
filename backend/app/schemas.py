from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Status = Literal["new", "confirmed", "completed", "cancelled", "no_show"]
HHMM = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


def normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits[0] in "78":
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    if not 11 <= len(digits) <= 15:
        raise ValueError("Некорректный номер телефона")
    return "+" + digits


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ServiceOut(ORM):
    id: int
    name: str
    category: str
    duration: int
    price: int
    active: bool


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=60)
    duration: int = Field(ge=5, le=600)
    price: int = Field(ge=0, le=1_000_000)
    active: bool = True


class MasterOut(ORM):
    id: int
    name: str
    role: str
    color: str
    service_ids: list[int]
    work_days: list[int]  # 0 = Monday


class BusinessOut(BaseModel):
    name: str
    tagline: str
    address: str
    phone: str


class Slot(BaseModel):
    time: str
    master_ids: list[int]


class DayAvailability(BaseModel):
    date: date
    slots: list[Slot]


class DaySummary(BaseModel):
    date: date
    free: int


class BookingIn(BaseModel):
    service_id: int
    master_id: int | None = None  # None = any available specialist
    date: date
    time: str = HHMM
    client_name: str = Field(min_length=2, max_length=80)
    client_phone: str
    comment: str = Field(default="", max_length=500)

    @field_validator("client_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Слишком короткое имя")
        return v

    @field_validator("client_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class BookingOut(BaseModel):
    id: int
    start: datetime
    end: datetime
    status: Status
    price: int
    comment: str
    created_at: datetime | None
    service_id: int
    service_name: str
    master_id: int
    master_name: str
    client_id: int
    client_name: str
    client_phone: str


class StatusIn(BaseModel):
    status: Status


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    token: str
    email: str


class ClientOut(BaseModel):
    id: int
    name: str
    phone: str
    visits: int
    spent: int
    last_visit: datetime | None
    next_visit: datetime | None


class DayStat(BaseModel):
    date: date
    revenue: int
    bookings: int


class TopService(BaseModel):
    name: str
    bookings: int
    revenue: int


class MasterLoad(BaseModel):
    id: int
    name: str
    color: str
    utilization: float  # 0..1
    revenue: int


class StatsOut(BaseModel):
    days: int
    revenue: int
    revenue_prev: int
    bookings: int
    bookings_prev: int
    avg_check: int
    new_clients: int
    cancel_rate: float
    by_day: list[DayStat]
    top_services: list[TopService]
    masters: list[MasterLoad]
