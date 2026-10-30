from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session as OrmSession
import pytest

import database
from models import Fight, HitEvent


def test_init_db_creates_current_schema_and_is_idempotent(monkeypatch):
    engine = create_engine("sqlite://")
    monkeypatch.setattr(database, "engine", engine)

    database.init_db()
    database.init_db()

    assert {"fights", "hit_events"} <= set(inspect(engine).get_table_names())
    engine.dispose()


def test_init_db_adds_missing_fight_columns(monkeypatch):
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE fights (id INTEGER PRIMARY KEY)"))
    monkeypatch.setattr(database, "engine", engine)

    database.init_db()

    columns = {column["name"] for column in inspect(engine).get_columns("fights")}
    assert {
        "video_filename",
        "team_red",
        "team_green",
        "elo_red",
        "elo_green",
        "category",
        "status",
        "status_note",
    } <= columns
    engine.dispose()


def test_init_db_normalizes_legacy_draw_results(monkeypatch):
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE fights (id INTEGER PRIMARY KEY, result VARCHAR(20))"))
        connection.execute(text("INSERT INTO fights (id, result) VALUES (1, 'empate')"))
    monkeypatch.setattr(database, "engine", engine)

    database.init_db()

    with engine.connect() as connection:
        result = connection.execute(text("SELECT result FROM fights WHERE id = 1")).scalar_one()
    assert result is None
    engine.dispose()


def test_init_db_backfills_closed_fight_winner_from_hit_counts(monkeypatch):
    engine = create_engine("sqlite://")
    database.Base.metadata.create_all(bind=engine)
    with OrmSession(engine) as session:
        fight = Fight(
            robot_red="Robo A",
            robot_green="Robo B",
            duration_seconds=60,
            fps=30,
            status="encerrada",
            robot_aliases={"vermelho": "Robo A", "azul": "Robo B"},
        )
        session.add(fight)
        session.flush()
        session.add_all(
            [
                HitEvent(fight_id=fight.id, frame=10, robot="vermelho"),
                HitEvent(fight_id=fight.id, frame=20, robot="vermelho"),
                HitEvent(fight_id=fight.id, frame=30, robot="azul"),
            ]
        )
        fight_id = fight.id
        session.commit()
    monkeypatch.setattr(database, "engine", engine)

    database.init_db()

    with OrmSession(engine) as session:
        fight = session.get(Fight, fight_id)
        assert fight.winner_robot == "Robo A"
        assert fight.result == "vitoria"
    engine.dispose()


def test_get_db_closes_session_after_use(monkeypatch):
    class FakeSession:
        closed = False

        def close(self):
            self.closed = True

    session = FakeSession()
    monkeypatch.setattr(database, "SessionLocal", lambda: session)
    generator = database.get_db()

    assert next(generator) is session
    with pytest.raises(StopIteration):
        next(generator)
    assert session.closed
