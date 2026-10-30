import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.orm import selectinload


load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required. Configure it in backend/.env.")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from models import Fight, HitEvent  # noqa: F401

    Base.metadata.create_all(bind=engine)
    columns = {column["name"] for column in inspect(engine).get_columns("fights")}
    migrations = {
        "video_filename": "VARCHAR(255)",
        "team_red": "VARCHAR(120)",
        "team_green": "VARCHAR(120)",
        "elo_red": "FLOAT",
        "elo_green": "FLOAT",
        "category": "VARCHAR(30)",
        "status": "VARCHAR(20) DEFAULT 'em_andamento'",
        "status_note": "TEXT",
    }
    missing = [(name, definition) for name, definition in migrations.items() if name not in columns]
    if missing:
        with engine.begin() as connection:
            for name, definition in missing:
                connection.execute(text(f"ALTER TABLE fights ADD COLUMN {name} {definition}"))
    if "result" in columns:
        with engine.begin() as connection:
            connection.execute(text("UPDATE fights SET result = NULL WHERE result = 'empate'"))
    columns = {column["name"] for column in inspect(engine).get_columns("fights")}
    result_columns = {
        "robot_red",
        "robot_green",
        "winner_robot",
        "result",
        "duration_seconds",
        "fps",
        "robot_aliases",
        "status",
    }
    if result_columns <= columns:
        from metrics import apply_hit_result

        with Session(engine) as session:
            fights = session.scalars(
                select(Fight)
                .options(selectinload(Fight.hits))
                .where(Fight.status == "encerrada", Fight.winner_robot.is_(None))
            ).all()
            for fight in fights:
                apply_hit_result(fight)
            session.commit()