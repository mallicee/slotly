import json
from pathlib import Path

import pytest

from app.availability import fits, free_slots, to_hhmm, to_minutes

CASES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "availability-cases.json").read_text(encoding="utf-8"))["cases"]


def _iv(pair):
    return to_minutes(pair[0]), to_minutes(pair[1])


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_cases(case):
    slots = free_slots(
        work=_iv(case["work"]),
        duration=case["duration"],
        busy=[_iv(b) for b in case["busy"]],
        breaks=[_iv(b) for b in case["breaks"]],
        step=case["step"],
        buffer=case["buffer"],
        not_before=to_minutes(case["notBefore"]) if case["notBefore"] else None,
    )
    assert [to_hhmm(t) for t in slots] == case["expected"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_every_slot_fits(case):
    """free_slots and fits must agree: every offered slot is bookable."""
    work = _iv(case["work"])
    busy = [_iv(b) for b in case["busy"]]
    breaks = [_iv(b) for b in case["breaks"]]
    for t in free_slots(work=work, duration=case["duration"], busy=busy, breaks=breaks,
                        step=case["step"], buffer=case["buffer"]):
        assert fits((t, t + case["duration"]), work, busy, breaks, case["buffer"])


def test_rejects_bad_input():
    with pytest.raises(ValueError):
        free_slots(work=(600, 700), duration=0)


def test_time_conversion_roundtrip():
    for m in (0, 59, 600, 1439):
        assert to_minutes(to_hhmm(m)) == m
