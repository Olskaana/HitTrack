from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Result = Literal["vitoria", "derrota"]
Category = Literal["fairyweight", "antweight", "beetleweight", "hobbyweight"]
FightStatus = Literal["em_andamento", "encerrada"]


class FightCreate(BaseModel):
    competition: str = Field(min_length=1, max_length=160)
    fought_at: datetime | None = None
    video_source: str | None = None
    robot_red: str = Field(min_length=1, max_length=120)
    robot_green: str = Field(min_length=1, max_length=120)
    team_red: str = Field(min_length=1, max_length=120)
    team_green: str = Field(min_length=1, max_length=120)
    category: Category
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


class FightResultUpdate(BaseModel):
    winner_robot: str = Field(min_length=1, max_length=120)


class FightEloUpdate(BaseModel):
    elo_red: float | None = None
    elo_green: float | None = None


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
    competition: str | None = None
    team_red: str | None = None
    team_green: str | None = None
    category: Category | None = None
    id: int
    created_at: datetime
    video_filename: str | None = None


class FightSummary(BaseModel):
    id: int
    competition: str | None
    fought_at: datetime | None
    created_at: datetime | None
    robot_red: str
    robot_green: str
    team_red: str | None
    team_green: str | None
    video_filename: str | None
    category: Category | None
    status: FightStatus
    status_note: str | None
    result: Result | None
    winner_robot: str | None
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


class OutcomeAnalytics(BaseModel):
    outcome: Result
    fight_count: int
    average_hits: float


class EloCorrelation(BaseModel):
    observations: int
    pearson: float | None
    spearman: float | None


class RobotAnalytics(BaseModel):
    robot: str
    fight_count: int
    wins: int
    losses: int
    total_hits: int
    average_hits_per_fight: float
    hits_per_minute: float
    sample_stddev_hits: float | None
    outcomes: list[OutcomeAnalytics]
    elo_correlation: EloCorrelation


class TeamAnalytics(BaseModel):
    team: str
    fight_count: int
    wins: int
    losses: int
    total_hits: int
    average_hits_per_fight: float
    hits_per_minute: float
    sample_stddev_hits: float | None
    robot_count: int
    outcomes: list[OutcomeAnalytics]


class FightAnalyticsSample(BaseModel):
    fight_id: int
    fought_at: datetime | None
    category: Category | None
    competition: str | None
    robot_red: str
    robot_green: str
    team_red: str | None
    team_green: str | None
    hits_red: int
    hits_green: int
    elo_red: float | None
    elo_green: float | None
    outcome_red: Result | None
    outcome_green: Result | None


class AnalyticsResponse(BaseModel):
    fight_count: int
    start_date: date | None
    end_date: date | None
    category: Category | None
    competition: str | None
    robot: str | None
    team: str | None
    robots: list[RobotAnalytics]
    teams: list[TeamAnalytics]
    fights: list[FightAnalyticsSample]