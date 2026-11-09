from sqlalchemy import select

from models import Fight
from seed_demo_data import (
    DEMO_COMPETITION_PREFIX,
    FICTIONAL_COMPETITIONS,
    FICTIONAL_ROBOTS,
    FICTIONAL_TEAMS,
    REALISTIC_DEMO_NOTE,
    REALISTIC_FIGHT_COUNT,
    build_demo_fights,
    build_realistic_demo_fights,
)


def test_build_demo_fights_uses_existing_robots_and_teams_and_is_idempotent(db_session):
    robots = [f"Robô {index:02d}" for index in range(17)]
    teams = [f"Equipe {index:02d}" for index in range(12)]
    db_session.add_all(
        [
            Fight(
                competition="Origem",
                robot_red=robots[index],
                robot_green=robots[index + 5],
                team_red=teams[index],
                team_green=teams[(index + 1) % len(teams)],
                category="antweight",
                status="encerrada",
                duration_seconds=60,
                fps=30,
            )
            for index in range(12)
        ]
    )
    db_session.commit()

    demo_fights = build_demo_fights(db_session)

    assert len(demo_fights) == 12
    assert all(fight.is_test for fight in demo_fights)
    assert {fight.competition for fight in demo_fights} == {
        f"{DEMO_COMPETITION_PREFIX} {index:02d}"
        for index in range(1, 13)
    }
    assert all(fight.robot_red in robots and fight.robot_green in robots for fight in demo_fights)
    assert all(fight.team_red in teams and fight.team_green in teams for fight in demo_fights)
    assert all(len(fight.hits) > 0 and fight.winner_robot for fight in demo_fights)

    db_session.add_all(demo_fights)
    db_session.commit()

    assert build_demo_fights(db_session) == []
    assert len(
        db_session.scalars(
            select(Fight).where(Fight.competition.like(f"{DEMO_COMPETITION_PREFIX}%"))
        ).all()
    ) == 12


def test_realistic_demo_fights_are_visible_and_generate_timeline_data(db_session):
    demo_fights = build_realistic_demo_fights(db_session)

    assert len(demo_fights) == REALISTIC_FIGHT_COUNT
    assert len({fight.competition for fight in demo_fights}) == len(FICTIONAL_COMPETITIONS)
    assert {fight.robot_red for fight in demo_fights} | {fight.robot_green for fight in demo_fights} <= set(FICTIONAL_ROBOTS)
    assert {fight.team_red for fight in demo_fights} | {fight.team_green for fight in demo_fights} <= set(FICTIONAL_TEAMS)
    assert all(not fight.is_test for fight in demo_fights)
    assert all(fight.status_note == REALISTIC_DEMO_NOTE for fight in demo_fights)
    assert all(fight.fought_at and fight.winner_robot and len(fight.hits) > 0 for fight in demo_fights)

    from analytics_service import calculate_analytics

    analytics = calculate_analytics(demo_fights)
    assert analytics["fight_count"] == REALISTIC_FIGHT_COUNT
    assert all(len(fight["hit_timeline"]) == 10 for fight in analytics["fights"])
    assert all(
        sum(bucket["hits_red"] + bucket["hits_green"] for bucket in fight["hit_timeline"])
        == fight["hits_red"] + fight["hits_green"]
        for fight in analytics["fights"]
    )
    assert any(
        sum(bucket["hits_red"] + bucket["hits_green"] for bucket in fight["hit_timeline"][1:])
        for fight in analytics["fights"]
    )

    db_session.add_all(demo_fights)
    db_session.commit()
    assert build_realistic_demo_fights(db_session) == []
