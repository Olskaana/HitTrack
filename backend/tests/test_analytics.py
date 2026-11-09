from datetime import datetime
from types import SimpleNamespace

import pytest

from analytics_service import calculate_analytics, filter_fights


def create_fight(
    fight_id,
    robot_red,
    robot_green,
    team_red,
    team_green,
    hits_red,
    hits_green,
    elo_red=None,
    elo_green=None,
    winner_robot=None,
    result=None,
    fought_at=None,
    category="antweight",
    competition=None,
):
    hits = [
        SimpleNamespace(frame=index, robot=robot_red)
        for index in range(hits_red)
    ] + [
        SimpleNamespace(frame=index, robot=robot_green)
        for index in range(hits_green)
    ]
    return SimpleNamespace(
        id=fight_id,
        robot_red=robot_red,
        robot_green=robot_green,
        team_red=team_red,
        team_green=team_green,
        duration_seconds=60,
        fps=30,
        robot_aliases={},
        elo_red=elo_red,
        elo_green=elo_green,
        winner_robot=winner_robot,
        result=result,
        fought_at=fought_at,
        created_at=None,
        competition=competition,
        category=category,
        hits=hits,
    )


@pytest.fixture
def sample_fights():
    return [
        create_fight(
            1,
            "Robo Alfa",
            "Robo Beta",
            "Equipe A",
            "Equipe B",
            10,
            2,
            elo_red=1000,
            elo_green=900,
            winner_robot="Robo Alfa",
            result="vitoria",
            fought_at=datetime(2026, 1, 10),
        ),
        create_fight(
            2,
            "Robo Alfa",
            "Robo Gamma",
            "Equipe A",
            "Equipe C",
            4,
            9,
            elo_red=1100,
            elo_green=950,
            winner_robot="Robo Gamma",
            result="derrota",
            fought_at=datetime(2026, 1, 20),
            category="beetleweight",
        ),
        create_fight(
            3,
            "Robo Beta",
            "Robo Alfa",
            "Equipe B",
            "Equipe A",
            6,
            8,
            elo_red=920,
            elo_green=1200,
            winner_robot="Robo Beta",
            result="vitoria",
            fought_at=datetime(2026, 2, 10),
        ),
    ]


def test_analytics_calculates_robot_outcomes_consistency_and_elo(sample_fights):
    analytics = calculate_analytics(sample_fights)

    alpha = next(robot for robot in analytics["robots"] if robot["robot"] == "Robo Alfa")

    assert alpha["fight_count"] == 3
    assert alpha["wins"] == 1
    assert alpha["losses"] == 2
    assert alpha["losses"] == 2
    assert alpha["total_hits"] == 22
    assert alpha["average_hits_per_fight"] == pytest.approx(7.333)
    assert alpha["hits_per_minute"] == pytest.approx(7.333)
    assert alpha["sample_stddev_hits"] == pytest.approx(3.055, abs=0.001)
    assert {item["outcome"]: item["average_hits"] for item in alpha["outcomes"]} == {
        "vitoria": 10,
        "derrota": 6,
    }
    assert alpha["elo_correlation"]["observations"] == 3
    assert alpha["elo_correlation"]["pearson"] == pytest.approx(-0.327327)
    assert alpha["elo_correlation"]["spearman"] == pytest.approx(-0.5)


def test_analytics_builds_team_profile_without_double_counting(sample_fights):
    analytics = calculate_analytics(sample_fights)

    team = next(team for team in analytics["teams"] if team["team"] == "Equipe A")

    assert team["fight_count"] == 3
    assert team["wins"] == 1
    assert team["losses"] == 2
    assert team["losses"] == 2
    assert team["total_hits"] == 22
    assert team["robot_count"] == 1
    assert team["sample_stddev_hits"] == pytest.approx(3.055, abs=0.001)


def test_analytics_marks_insufficient_elo_and_consistency_data_as_unavailable():
    analytics = calculate_analytics(
        [create_fight(1, "Solo", "Oponente", "Equipe Solo", "Equipe X", 4, 1)]
    )
    solo = next(robot for robot in analytics["robots"] if robot["robot"] == "Solo")
    team = next(team for team in analytics["teams"] if team["team"] == "Equipe Solo")

    assert solo["sample_stddev_hits"] is None
    assert solo["elo_correlation"] == {
        "observations": 0,
        "pearson": None,
        "spearman": None,
    }
    assert team["sample_stddev_hits"] is None


def test_date_and_category_filters_are_inclusive_and_exclude_missing_dates(sample_fights):
    undated = create_fight(4, "Robo Delta", "Robo Epsilon", "Equipe D", "Equipe E", 2, 1)

    selected = filter_fights(
        [*sample_fights, undated],
        start_date=datetime(2026, 1, 20).date(),
        end_date=datetime(2026, 1, 31).date(),
        category="beetleweight",
    )

    assert [fight.id for fight in selected] == [2]


def test_competition_filter_selects_only_matching_fights(sample_fights):
    sample_fights[0].competition = "Copa Regional"
    sample_fights[1].competition = "Desafio Nacional"
    sample_fights[2].competition = "Copa Regional"

    selected = filter_fights(sample_fights, competition="Copa Regional")

    assert [fight.id for fight in selected] == [1, 3]


def test_robot_and_team_filters_match_participants_and_combine(sample_fights):
    selected = filter_fights(
        sample_fights,
        robot="Robo Alfa",
        team="Equipe A",
    )

    assert [fight.id for fight in selected] == [1, 2, 3]
    assert filter_fights(sample_fights, robot="Robo Alfa", team="Equipe C") == [sample_fights[1]]
    assert filter_fights(sample_fights, robot="Robo Desconhecido") == []


def test_date_filter_uses_creation_date_when_fight_date_is_missing(sample_fights):
    undated = create_fight(4, "Robo Delta", "Robo Epsilon", "Equipe D", "Equipe E", 2, 1)
    undated.created_at = datetime(2026, 1, 15)

    selected = filter_fights([*sample_fights, undated], start_date=datetime(2026, 1, 1).date())

    assert [fight.id for fight in selected] == [1, 2, 3, 4]


def test_date_filter_excludes_fights_without_any_date(sample_fights):
    undated = create_fight(4, "Robo Delta", "Robo Epsilon", "Equipe D", "Equipe E", 2, 1)

    selected = filter_fights([*sample_fights, undated], start_date=datetime(2026, 1, 1).date())

    assert [fight.id for fight in selected] == [1, 2, 3]


def test_analytics_endpoint_returns_filtered_stats_and_chart_samples(api_client, db_session):
    from models import Fight, HitEvent

    fight = Fight(
        robot_red="Robo A",
        robot_green="Robo B",
        team_red="Equipe A",
        team_green="Equipe B",
        category="antweight",
        status="encerrada",
        result="vitoria",
        winner_robot="Robo A",
        duration_seconds=60,
        fps=30,
        elo_red=1000,
        elo_green=900,
        fought_at=datetime(2026, 5, 12),
        competition="Copa Regional",
    )
    db_session.add(fight)
    db_session.flush()
    db_session.add_all(
        [
            HitEvent(fight_id=fight.id, frame=10, robot="Robo A"),
            HitEvent(fight_id=fight.id, frame=20, robot="Robo A"),
            HitEvent(fight_id=fight.id, frame=30, robot="Robo B"),
        ]
    )
    db_session.commit()

    response = api_client.get(
        "/api/analytics?start_date=2026-05-01&end_date=2026-05-31&category=antweight"
        "&competition=Copa%20Regional&robot=Robo%20A&team=Equipe%20A"
    )

    assert response.status_code == 200
    data = response.json()
    assert data["fight_count"] == 1
    assert data["competition"] == "Copa Regional"
    assert data["robot"] == "Robo A"
    assert data["team"] == "Equipe A"
    assert data["robots"][0]["robot"] == "Robo A"
    assert data["robots"][0]["hits_per_minute"] == 2
    assert data["robots"][0]["wins"] == 1
    assert data["fights"][0]["hits_red"] == 2
    assert data["fights"][0]["elo_red"] == 1000


def test_analytics_endpoint_rejects_reversed_date_range(api_client):
    response = api_client.get("/api/analytics?start_date=2026-06-02&end_date=2026-06-01")

    assert response.status_code == 422
