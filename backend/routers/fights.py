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
from schemas import (
    FightCreate,
    FightEloUpdate,
    FightMetrics,
    FightResponse,
    FightResultUpdate,
    FightSummary,
    HitImport,
    HitResponse,
)


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
            competition=fight.competition,
            fought_at=fight.fought_at,
            created_at=fight.created_at,
            robot_red=fight.robot_red,
            robot_green=fight.robot_green,
            team_red=fight.team_red,
            team_green=fight.team_green,
            video_filename=fight.video_filename,
            category=fight.category,
            status=fight.status,
            status_note=fight.status_note,
            result=fight.result,
            winner_robot=fight.winner_robot,
            total_hits=len(fight.hits),
            duration_seconds=fight.duration_seconds,
        )
        for fight in fights
    ]


@router.get("/{fight_id}", response_model=FightResponse)
def read_fight(fight_id: int, db: Session = Depends(get_db)):
    return get_fight(fight_id, db)


@router.patch("/{fight_id}/result", response_model=FightResponse)
def set_fight_result(
    fight_id: int,
    payload: FightResultUpdate,
    db: Session = Depends(get_db),
):
    fight = get_fight(fight_id, db)
    if fight.status != "encerrada":
        raise HTTPException(status_code=409, detail="Encerre a luta antes de registrar o vencedor.")
    if payload.winner_robot not in {fight.robot_red, fight.robot_green}:
        raise HTTPException(status_code=422, detail="O vencedor deve ser um dos robôs cadastrados na luta.")

    fight.winner_robot = payload.winner_robot
    fight.result = "vitoria"
    if fight.status_note and fight.status_note.startswith("Empate em hits"):
        fight.status_note = f"{fight.status_note.split(';', maxsplit=1)[0]}; resultado avaliado manualmente."
    else:
        fight.status_note = "Vencedor informado manualmente."
    db.commit()
    db.refresh(fight)
    return fight


@router.patch("/{fight_id}/elo", response_model=FightResponse)
def set_fight_elo(
    fight_id: int,
    payload: FightEloUpdate,
    db: Session = Depends(get_db),
):
    fight = get_fight(fight_id, db)
    fight.elo_red = payload.elo_red
    fight.elo_green = payload.elo_green
    db.commit()
    db.refresh(fight)
    return fight


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
    existing_hits = set(
        db.execute(
            select(HitEvent.frame, HitEvent.robot).where(HitEvent.fight_id == fight.id)
        ).all()
    )
    events = []
    for item in payload.events:
        identity = (item.frame, item.robot)
        if identity not in existing_hits:
            existing_hits.add(identity)
            events.append(HitEvent(fight_id=fight.id, frame=item.frame, robot=item.robot))

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