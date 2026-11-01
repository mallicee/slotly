"""Free-slot calculation.

Pure functions over minutes-from-midnight, so they are trivial to test.
The same algorithm is implemented in frontend/src/lib/availability.ts and
both are checked against shared/availability-cases.json.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

Interval = tuple[int, int]


def to_minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def to_hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def free_slots(
    *,
    work: Interval,
    duration: int,
    busy: Iterable[Interval] = (),
    breaks: Iterable[Interval] = (),
    step: int = 15,
    buffer: int = 0,
    not_before: int | None = None,
) -> list[int]:
    """Start times (minutes) where a service of `duration` fits.

    A slot [t, t + duration) must lie inside `work`, avoid every break and keep
    `buffer` minutes of clearance around existing bookings. Candidate starts
    lie on a `step` grid anchored at the start of the working day.
    """
    if duration <= 0 or step <= 0:
        raise ValueError("duration and step must be positive")

    blocked: list[Interval] = [(s - buffer, e + buffer) for s, e in busy]
    blocked.extend(breaks)

    start, end = work
    slots = []
    t = start
    while t + duration <= end:
        if (not_before is None or t >= not_before) and all(
            t + duration <= b_start or t >= b_end for b_start, b_end in blocked
        ):
            slots.append(t)
        t += step
    return slots


def overlaps(a: Interval, b: Interval) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def fits(slot: Interval, work: Interval, busy: Sequence[Interval], breaks: Sequence[Interval], buffer: int = 0) -> bool:
    """Whether an exact interval is bookable. Used to re-check on submit."""
    if slot[0] < work[0] or slot[1] > work[1]:
        return False
    if any(overlaps(slot, (s - buffer, e + buffer)) for s, e in busy):
        return False
    return not any(overlaps(slot, b) for b in breaks)
