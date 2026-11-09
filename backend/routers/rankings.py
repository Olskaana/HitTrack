from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import RankingSnapshot
from robo_core_rankings import (
    RANKING_BASE_URL,
    RANKING_CATEGORIES,
    RankingImportError,
    import_ranking,
    latest_ranking,
)
from schemas import Category, RankingResponse


router = APIRouter(prefix="/api/rankings", tags=["rankings"])


def _response(category: str, snapshot: RankingSnapshot | None) -> RankingResponse:
    if snapshot is None:
        return RankingResponse(
            category=category,
            source_url=f"{RANKING_BASE_URL}/{category}",
            imported_at=None,
            entries=[],
        )
    return RankingResponse(
        category=snapshot.category,
        source_url=snapshot.source_url,
        imported_at=snapshot.imported_at,
        entries=snapshot.entries,
    )


@router.get("", response_model=RankingResponse)
def read_ranking(
    category: Category = Query(...),
    db: Session = Depends(get_db),
):
    if category not in RANKING_CATEGORIES:
        raise HTTPException(status_code=422, detail="Categoria sem ranking disponível.")
    return _response(category, latest_ranking(category, db))


@router.post("/refresh", response_model=RankingResponse)
def refresh_ranking(
    category: Category = Query(...),
    db: Session = Depends(get_db),
):
    if category not in RANKING_CATEGORIES:
        raise HTTPException(status_code=422, detail="Categoria sem ranking disponível.")
    try:
        snapshot = import_ranking(category, db)
    except RankingImportError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return _response(category, snapshot)
