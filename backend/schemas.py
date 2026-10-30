from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Result = Literal["vitoria", "derrota", "empate"]
Category = Literal["fairyweight", "antweight", "beetleweight", "hobbyweight"]
FightStatus = Literal["em_andamento", "encerrada"]


class FightCreate(BaseModel):
    competition: str | None = Field(default=None, max_length=160)
    fought_at: datetime | None = None
    video_source: str | None = None
    robot_red: str = Field(min_length=1, max_length=120)
    robot_green: str = Field(min_length=1, max_length=120)
    team_red: str | None = Field(default=None, max_length=120)
    team_green: str | None = Field(default=None, max_length=120)
    category: Category | None = None
    status: FightStatus = "em_andamento"
    status_note: str | None = None
    result: Result | None = None
    winner_robot: str | None = Field(default=None, max_length=120)
    duration_seconds: float = Field(gt=0)
    fps: float = Field(gt=0)
    elo_red: float | None = None
    elo_green: float | None = None
    robot_aliases: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_winner(self):
        if self.winner_robot and self.winner_robot not in {self.robot_red, self.robot_green}:
            raise ValueError("winner_robot deve ser um dos robôs da luta")
        return self


class HitInput(BaseModel):
    frame: int = Field(ge=0)
    robot: str = Field(min_length=1, max_length=120)


class HitImport(BaseModel):
    events: list[HitInput] = Field(min_length=1)


class HitResponse(HitInput):
    model_config = ConfigDict(from_attributes=True)
    id: int


class FightResponse(FightCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    video_filename: str | None = None


class FightSummary(BaseModel):
    id: int
    robot_red: str
    robot_green: str
    team_red: str | None
    team_green: str | None
    category: Category | None
    status: FightStatus
    status_note: str | None
    result: Result | None
    total_hits: int
    duration_seconds: float


class RobotMetrics(BaseModel):
    robot: str
    hits: int
    hits_per_minute: float
    third_distribution: list[int]


class FightMetrics(BaseModel):
    fight_id: int
    duration_seconds: float
    total_hits: int
    robots: list[RobotMetrics]