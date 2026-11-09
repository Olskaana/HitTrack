from datetime import datetime

import pytest
from pydantic import ValidationError

from schemas import FightCreate, HitImport


def valid_fight(**overrides):
    return {
        "competition": "Copa Regional",
        "robot_red": "Robo A",
        "robot_green": "Robo B",
        "team_red": "Equipe A",
        "team_green": "Equipe B",
        "category": "antweight",
        "duration_seconds": 120,
        "fps": 30,
        **overrides,
    }


def test_fight_create_applies_defaults_and_accepts_matching_winner():
    fight = FightCreate(**valid_fight(winner_robot="Robo A"))

    assert fight.status == "em_andamento"
    assert fight.robot_aliases == {}
    assert fight.winner_robot == "Robo A"


@pytest.mark.parametrize(
    "changes",
    [
        {"winner_robot": "Outro robô"},
        {"robot_red": ""},
        {"duration_seconds": 0},
        {"fps": 0},
        {"category": "invalid"},
        {"status": "invalid"},
        {"result": "invalid"},
        {"result": "empate"},
        {"competition": "x" * 161},
    ],
)
def test_fight_create_rejects_invalid_values(changes):
    with pytest.raises(ValidationError):
        FightCreate(**valid_fight(**changes))


def test_fight_create_accepts_required_competition_fields():
    fight = FightCreate(
        **valid_fight(
            competition="Regional",
            fought_at=datetime(2026, 1, 1),
            category="antweight",
            result="vitoria",
            status="encerrada",
        )
    )

    assert fight.competition == "Regional"
    assert fight.category == "antweight"
    assert fight.status == "encerrada"


@pytest.mark.parametrize("field", ["competition", "team_red", "team_green", "category"])
def test_fight_create_requires_competition_category_and_teams(field):
    payload = valid_fight()
    payload.pop(field)

    with pytest.raises(ValidationError):
        FightCreate(**payload)


@pytest.mark.parametrize("event", [{"frame": -1, "robot": "Robo A"}, {"frame": 0, "robot": ""}])
def test_hit_import_rejects_invalid_events(event):
    with pytest.raises(ValidationError):
        HitImport(events=[event])


def test_hit_import_requires_at_least_one_event():
    with pytest.raises(ValidationError):
        HitImport(events=[])


def test_hit_import_accepts_valid_events():
    payload = HitImport(events=[{"frame": 0, "robot": "Robo A"}])

    assert payload.events[0].frame == 0
