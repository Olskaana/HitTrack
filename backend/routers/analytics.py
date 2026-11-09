from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from analytics_service import calculate_analytics, filter_fights
from database import get_db
from models import Fight
from schemas import AnalyticsResponse, Category


router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("", response_model=AnalyticsResponse)
def read_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    category: Category | None = Query(default=None),
    competition: str | None = Query(default=None, max_length=160),
    robot: str | None = Query(default=None, max_length=120),
    team: str | None = Query(default=None, max_length=120),
    db: Session = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date deve ser anterior a end_date")

    fights = db.scalars(
        select(Fight).options(selectinload(Fight.hits)).order_by(Fight.id)
    ).all()
    selected_fights = filter_fights(
        fights,
        start_date,
        end_date,
        category,
        competition,
        robot,
        team,
    )
    result = calculate_analytics(selected_fights)
    return {
        **result,
        "start_date": start_date,
        "end_date": end_date,
        "category": category,
        "competition": competition,
        "robot": robot,
        "team": team,
    }
