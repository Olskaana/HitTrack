from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, false
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
    is_test: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default=false()
    )
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


class RankingSnapshot(Base):
    __tablename__ = "ranking_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(30), index=True)
    source_url: Mapped[str] = mapped_column(String(255))
    imported_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    entries: Mapped[list["RankingEntry"]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan"
    )


class RankingEntry(Base):
    __tablename__ = "ranking_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("ranking_snapshots.id", ondelete="CASCADE"), index=True
    )
    rank_position: Mapped[int] = mapped_column(Integer)
    elo_score: Mapped[float] = mapped_column(Float)
    robot_name: Mapped[str] = mapped_column(String(160))
    team_name: Mapped[str | None] = mapped_column(String(160))
    robot_source_id: Mapped[int] = mapped_column(Integer)
    total_fights: Mapped[int] = mapped_column(Integer)
    wins: Mapped[int] = mapped_column(Integer)
    losses: Mapped[int] = mapped_column(Integer)
    latest_fight_at: Mapped[datetime | None] = mapped_column(DateTime)
    robot_url: Mapped[str] = mapped_column(String(255))
    snapshot: Mapped[RankingSnapshot] = relationship(back_populates="entries")