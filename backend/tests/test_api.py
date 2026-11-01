from datetime import datetime

from app.notify import format_booking
from app.schemas import BookingOut

MONDAY = "2026-11-02"  # Artyom works 10-20 with a 14-15 break; Daniil is off
WEDNESDAY = "2026-11-04"  # both barbers work


def book(client, **overrides):
    body = {
        "service_id": 1, "master_id": 1, "date": MONDAY, "time": "11:00",
        "client_name": "Иван Петров", "client_phone": "8 (921) 123-45-67",
    }
    body.update(overrides)
    return client.post("/api/bookings", json=body)


def slots(client, **params):
    r = client.get("/api/availability", params={"service_id": 1, "date": MONDAY, **params})
    assert r.status_code == 200, r.text
    return [s["time"] for s in r.json()["slots"]]


# ---------- Public API ----------

def test_catalog(client):
    services = client.get("/api/services").json()
    assert len(services) == 9
    barbers = client.get("/api/masters", params={"service_id": 1}).json()
    assert [m["name"] for m in barbers] == ["Артём", "Даниил"]


def test_availability_respects_hours_and_break(client):
    times = slots(client, master_id=1)
    assert times[0] == "10:00" and times[-1] == "19:00"
    assert "13:00" in times  # ends exactly when the break starts
    assert "13:15" not in times and "14:30" not in times
    assert len(times) == 13 + 17


def test_day_off_has_no_slots(client):
    assert slots(client, master_id=2) == []


def test_booking_takes_the_slot(client):
    r = book(client)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["client_phone"] == "+79211234567"
    assert data["master_name"] == "Артём"
    assert data["end"].endswith("12:00:00")
    times = slots(client, master_id=1)
    for t in ("10:15", "10:30", "10:45", "11:00", "11:45"):
        assert t not in times
    assert "10:00" in times and "12:00" in times


def test_double_booking_is_rejected(client):
    assert book(client).status_code == 201
    r = book(client, time="11:30", client_phone="+79990000000")
    assert r.status_code == 409
    assert "заняли" in r.json()["detail"]


def test_any_master_balances_load(client):
    first = book(client, master_id=None, date=WEDNESDAY, time="12:00")
    second = book(client, master_id=None, date=WEDNESDAY, time="12:00", client_phone="+79990000001")
    third = book(client, master_id=None, date=WEDNESDAY, time="12:00", client_phone="+79990000002")
    assert first.status_code == second.status_code == 201
    assert {first.json()["master_name"], second.json()["master_name"]} == {"Артём", "Даниил"}
    assert third.status_code == 409


def test_cannot_book_too_soon_or_in_the_past(client):
    # "now" is 09:00 on Monday; the earliest bookable start is 09:30.
    r = book(client, date="2026-11-01", time="12:00")
    assert r.status_code == 422


def test_master_must_offer_service(client):
    assert book(client, master_id=3).status_code == 422


def test_validation(client):
    assert book(client, client_phone="123").status_code == 422
    assert book(client, client_name=" ").status_code == 422
    assert book(client, time="25:00").status_code == 422


def test_returning_client_is_reused(client, auth):
    book(client, time="10:00")
    book(client, time="16:00", client_name="Иван")
    clients = client.get("/api/admin/clients", headers=auth).json()
    assert len(clients) == 1 and clients[0]["name"] == "Иван"


# ---------- Admin API ----------

def test_admin_requires_auth(client):
    assert client.get("/api/admin/bookings", params={"from": MONDAY, "to": MONDAY}).status_code == 401
    bad = {"Authorization": "Bearer nope"}
    assert client.get("/api/admin/me", headers=bad).status_code == 401


def test_login_rejects_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "admin@slotly.demo", "password": "wrong"})
    assert r.status_code == 401


def test_cancelling_frees_the_slot(client, auth):
    booking = book(client).json()
    assert "11:00" not in slots(client, master_id=1)
    r = client.patch(f"/api/admin/bookings/{booking['id']}", json={"status": "cancelled"}, headers=auth)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert "11:00" in slots(client, master_id=1)


def test_admin_lists_bookings_in_range(client, auth):
    book(client)
    book(client, master_id=None, date=WEDNESDAY, time="12:00")
    r = client.get("/api/admin/bookings", params={"from": MONDAY, "to": MONDAY}, headers=auth)
    assert [b["start"][:10] for b in r.json()] == [MONDAY]


def test_service_crud(client, auth):
    r = client.post("/api/admin/services", json={"name": "Камуфляж седины", "category": "Барбершоп", "duration": 30, "price": 900}, headers=auth)
    assert r.status_code == 201
    sid = r.json()["id"]
    r = client.put(f"/api/admin/services/{sid}", json={"name": "Камуфляж седины", "category": "Барбершоп", "duration": 45, "price": 1100}, headers=auth)
    assert r.json()["duration"] == 45
    assert client.delete(f"/api/admin/services/{sid}", headers=auth).status_code == 204
    assert sid not in [s["id"] for s in client.get("/api/admin/services", headers=auth).json()]


def test_service_with_history_is_archived(client, auth):
    book(client)
    assert client.delete("/api/admin/services/1", headers=auth).status_code == 204
    archived = next(s for s in client.get("/api/admin/services", headers=auth).json() if s["id"] == 1)
    assert archived["active"] is False
    assert 1 not in [s["id"] for s in client.get("/api/services").json()]


def test_stats_shape(client, auth):
    r = client.get("/api/admin/stats", params={"days": 7}, headers=auth)
    assert r.status_code == 200
    data = r.json()
    assert len(data["by_day"]) == 7
    assert {m["name"] for m in data["masters"]} == {"Артём", "Даниил", "Ника", "Ева"}


# ---------- Notifications ----------

def test_notification_escapes_html():
    b = BookingOut(
        id=1, start=datetime(2026, 11, 2, 11), end=datetime(2026, 11, 2, 12), status="new", price=2200,
        comment="<script>", created_at=None, service_id=1, service_name="Стрижка", master_id=1,
        master_name="Артём", client_id=1, client_name="<b>Ваня</b>", client_phone="+79211234567",
    )
    text = format_booking(b)
    assert "&lt;b&gt;Ваня&lt;/b&gt;" in text and "&lt;script&gt;" in text
    assert "02.11 (пн) 11:00–12:00" in text
