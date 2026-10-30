import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from database import get_db
from metrics import calculate_metrics
from models import Fight, HitEvent
from schemas import FightCreate, FightMetrics, FightResponse, FightSummary, HitImport, HitResponse


router = APIRouter(prefix="/api/fights", tags=["fights"])
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}


def get_fight(fight_id: int, db: Session) -> Fight:
    fight = db.scalar(select(Fight).options(selectinload(Fight.hits)).where(Fight.id == fight_id))
    if fight is None:
        raise HTTPException(status_code=404, detail="Luta não encontrada")
    return fight


def validate_hit_robots(fight: Fight, payload: HitImport) -> None:
    aliases = fight.robot_aliases or {}
    valid_robots = {
        fight.robot_red,
        fight.robot_green,
        "vermelho",
        "azul",
        *aliases.keys(),
        *aliases.values(),
    }
    invalid_robots = sorted({item.robot for item in payload.events if item.robot not in valid_robots})
    if invalid_robots:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Cada hit deve identificar um robô cadastrado ou um alias válido.",
                "invalid_robots": invalid_robots,
                "valid_robots": sorted(valid_robots),
            },
        )


@router.post("", response_model=FightResponse, status_code=status.HTTP_201_CREATED)
def create_fight(payload: FightCreate, db: Session = Depends(get_db)):
    fight = Fight(**payload.model_dump())
    db.add(fight)
    db.commit()
    db.refresh(fight)
    return fight


@router.get("", response_model=list[FightSummary])
def list_fights(db: Session = Depends(get_db)):
    fights = db.scalars(
        select(Fight).options(selectinload(Fight.hits)).order_by(desc(Fight.created_at), desc(Fight.id))
    ).all()
    return [
        FightSummary(
            id=fight.id,
            robot_red=fight.robot_red,
            robot_green=fight.robot_green,
            team_red=fight.team_red,
            team_green=fight.team_green,
            category=fight.category,
            status=fight.status,
            status_note=fight.status_note,
            result=fight.result,
            total_hits=len(fight.hits),
            duration_seconds=fight.duration_seconds,
        )
        for fight in fights
    ]


@router.get("/{fight_id}", response_model=FightResponse)
def read_fight(fight_id: int, db: Session = Depends(get_db)):
    return get_fight(fight_id, db)


@router.post("/{fight_id}/video", response_model=FightResponse)
async def upload_video(fight_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    fight = get_fight(fight_id, db)
    extension = Path(file.filename or "").suffix.lower()
    if file.content_type not in ALLOWED_VIDEO_TYPES or extension not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Envie um vídeo MP4, MOV, AVI ou WEBM.")

    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename or "video.mp4")
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    destination = UPLOADS_DIR / f"fight_{fight.id}_{safe_name}"
    with destination.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            output.write(chunk)

    fight.video_source = str(destination)
    fight.video_filename = safe_name
    db.commit()
    db.refresh(fight)
    return fight


@router.get("/{fight_id}/video", response_class=FileResponse)
def read_video(fight_id: int, db: Session = Depends(get_db)):
    fight = get_fight(fight_id, db)
    if not fight.video_source:
        raise HTTPException(status_code=404, detail="Esta luta não possui vídeo associado.")

    video_path = Path(fight.video_source)
    if not video_path.is_file():
        raise HTTPException(status_code=404, detail="O vídeo associado à luta não foi encontrado.")

    media_types = {
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
    }
    return FileResponse(
        video_path,
        media_type=media_types.get(video_path.suffix.lower(), "application/octet-stream"),
        filename=fight.video_filename or video_path.name,
        content_disposition_type="inline",
    )


@router.post("/{fight_id}/hits", response_model=list[HitResponse], status_code=status.HTTP_201_CREATED)
def import_hits(fight_id: int, payload: HitImport, db: Session = Depends(get_db)):
    fight = get_fight(fight_id, db)
    validate_hit_robots(fight, payload)
    events = [HitEvent(fight_id=fight.id, frame=item.frame, robot=item.robot) for item in payload.events]
    db.add_all(events)
    db.commit()
    for event in events:
        db.refresh(event)
    return events


@router.post("/{fight_id}/hits/upload", response_model=list[HitResponse], status_code=status.HTTP_201_CREATED)
async def upload_hits(fight_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    get_fight(fight_id, db)
    try:
        data = json.loads((await file.read()).decode("utf-8"))
        payload = HitImport(events=data)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=f"Arquivo de hits inválido: {error}") from error
    return import_hits(fight_id, payload, db)


@router.get("/{fight_id}/metrics", response_model=FightMetrics)
def fight_metrics(fight_id: int, db: Session = Depends(get_db)):
    return calculate_metrics(get_fight(fight_id, db))