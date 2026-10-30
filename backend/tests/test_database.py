from sqlalchemy import create_engine, inspect, text
import pytest

import database


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
        "category",
        "status",
        "status_note",
    } <= columns
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
