from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Fight(Base):
    __tablename__ = "fights"

    id: Mapped[int] = mapped_column(primary_key=True)
    competition: Mapped[str | None] = mapped_column(String(160))
    fought_at: Mapped[datetime | None] = mapped_column(DateTime)
    video_source: Mapped[str | None] = mapped_column(Text)
    video_filename: Mapped[str | None] = mapped_column(String(255))
    robot_red: Mapped[str] = mapped_column(String(120))
    robot_green: Mapped[str] = mapped_column(String(120))
    team_red: Mapped[str | None] = mapped_column(String(120))
    team_green: Mapped[str | None] = mapped_column(String(120))
    category: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="em_andamento")
    status_note: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(String(20))
    winner_robot: Mapped[str | None] = mapped_column(String(120))
    duration_seconds: Mapped[float] = mapped_column(Float)
    fps: Mapped[float] = mapped_column(Float)
    elo_red: Mapped[float | None] = mapped_column(Float)
    elo_green: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    robot_aliases: Mapped[dict] = mapped_column(JSON, default=dict)
    hits: Mapped[list["HitEvent"]] = relationship(
        back_populates="fight", cascade="all, delete-orphan"
    )


class HitEvent(Base):
    __tablename__ = "hit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    fight_id: Mapped[int] = mapped_column(ForeignKey("fights.id"), index=True)
    frame: Mapped[int] = mapped_column(Integer)
    robot: Mapped[str] = mapped_column(String(120))
    source_robot: Mapped[str | None] = mapped_column(String(120))
    fight: Mapped[Fight] = relationship(back_populates="hits")