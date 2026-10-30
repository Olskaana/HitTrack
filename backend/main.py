import json
import hashlib
import os
import sys
import threading
import time
from pathlib import Path

import cv2
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select

from database import SessionLocal, get_db, init_db
from hit_state import HitState
from latest import Latest
from models import Fight, HitEvent
from auto_detector import AutoHitWorker
from routers.fights import router as fights_router


BASE_DIR = Path(__file__).resolve().parent.parent
AI_PROJECT_DIR = Path(os.getenv("AI_PROJECT_DIR", BASE_DIR / "hitcount-ia")).resolve()
AI_BACKEND_DIR = AI_PROJECT_DIR / "backend"
sys.path.insert(0, str(AI_BACKEND_DIR))

from detector import CamWorker  # noqa: E402


app = FastAPI(title="HitTrack API", version="1.0")
app.include_router(fights_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


latest = Latest()
hit_state = HitState()
worker: CamWorker | AutoHitWorker | None = None
analysis_generation = 0
last_analysis_frame = 0
HITS_FILE = AI_BACKEND_DIR / "data" / "hits_rotulados.json"
WEIGHTS = AI_PROJECT_DIR / "models" / "best.pt"
VIDEO_DIR = AI_PROJECT_DIR / "videos"
VIDEO_SRC = next(iter(VIDEO_DIR.glob("*.mp4")), VIDEO_DIR / "video1.mp4")
active_video = VIDEO_SRC


@app.on_event("startup")
def startup():
    init_db()


def same_file(first: Path, second: Path) -> bool:
    if not first.is_file() or not second.is_file() or first.stat().st_size != second.stat().st_size:
        return False
    digest = hashlib.sha256()
    with first.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    first_digest = digest.digest()
    digest = hashlib.sha256()
    with second.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return first_digest == digest.digest()


def load_reference_hits() -> list[dict]:
    try:
        with HITS_FILE.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        print(f"[ERRO] Falha ao ler eventos rotulados: {error}")
        return []


def run_auto_analysis(video_source: str, fight_id: int, robot_names: tuple[str, str], generation: int):
    global worker, last_analysis_frame

    def persist_hit(frame: int, robot: str) -> bool:
        if generation != analysis_generation:
            return False
        with SessionLocal() as session:
            duplicate = session.scalar(
                select(HitEvent).where(
                    HitEvent.fight_id == fight_id,
                    HitEvent.frame == frame,
                    HitEvent.robot == robot,
                )
            )
            if duplicate is not None:
                return False
            session.add(HitEvent(fight_id=fight_id, frame=frame, robot=robot))
            session.commit()
        return True

    hit_state.reset()
    reference_hits = load_reference_hits() if same_file(Path(video_source), VIDEO_SRC) else None
    if reference_hits:
        worker = CamWorker(
            src=video_source,
            latest=latest,
            weights=str(WEIGHTS),
            conf=0.5,
            hit_state=hit_state,
            hits_map=reference_hits,
            robot_names=robot_names,
            on_hit=persist_hit,
        )
    else:
        worker = AutoHitWorker(
            src=video_source,
            weights=WEIGHTS,
            latest=latest,
            hit_state=hit_state,
            robot_names=robot_names,
            on_hit=persist_hit,
        )
    worker.paused = False
    worker.start()

    def finalize_when_finished(current_worker):
        global last_analysis_frame
        current_worker.join()
        last_analysis_frame = getattr(current_worker, "frame_idx", last_analysis_frame)
        if generation != analysis_generation:
            return
        with SessionLocal() as session:
            fight = session.scalar(select(Fight).where(Fight.id == fight_id))
            if fight is not None and fight.status == "em_andamento":
                fight.status = "encerrada"
                fight.status_note = None
                session.commit()

    threading.Thread(target=finalize_when_finished, args=(worker,), daemon=True).start()


def create_worker(conf: float = 0.5, video_source: Path | None = None, hits_list: list | None = None):
    global worker, active_video
    if worker is not None:
        worker.stop()
    hit_state.reset()
    active_video = video_source or VIDEO_SRC
    if hits_list is None:
        try:
            with HITS_FILE.open("r", encoding="utf-8") as file:
                hits_list = json.load(file)
        except (OSError, json.JSONDecodeError) as error:
            print(f"[ERRO] Falha ao ler eventos da IA: {error}")
            hits_list = []

    worker = CamWorker(
        src=str(active_video),
        latest=latest,
        weights=str(WEIGHTS),
        conf=conf,
        hit_state=hit_state,
        hits_map=hits_list,
    )
    worker.paused = True
    worker.start()


@app.post("/api/fights/{fight_id}/analyze")
def analyze_fight(fight_id: int, db: Session = Depends(get_db)):
    fight = db.scalar(select(Fight).options(selectinload(Fight.hits)).where(Fight.id == fight_id))
    if fight is None:
        raise HTTPException(status_code=404, detail="Luta não encontrada")
    if not fight.video_source:
        if fight.id != 1 or not VIDEO_SRC.exists():
            raise HTTPException(status_code=400, detail="Envie um vídeo antes de iniciar a análise.")
        fight.video_source = str(VIDEO_SRC)
        fight.video_filename = VIDEO_SRC.name
        db.commit()
    if not Path(fight.video_source).exists():
        raise HTTPException(status_code=400, detail="O vídeo associado à luta não foi encontrado.")

    db.query(HitEvent).filter(HitEvent.fight_id == fight.id).delete(synchronize_session=False)
    db.commit()

    global worker, analysis_generation, last_analysis_frame
    analysis_generation += 1
    generation = analysis_generation
    last_analysis_frame = 0
    fight.status = "em_andamento"
    fight.status_note = None
    db.commit()
    if worker is not None:
        worker.stop()
        if worker.is_alive():
            worker.join(timeout=5)
    hit_state.reset()
    threading.Thread(
        target=run_auto_analysis,
        args=(fight.video_source, fight.id, (fight.robot_red, fight.robot_green), generation),
        daemon=True,
    ).start()
    return {"analysis_started": True, "fight_id": fight.id, "video": fight.video_filename}


@app.post("/api/fights/{fight_id}/stop")
def stop_fight(fight_id: int, db: Session = Depends(get_db)):
    fight = db.scalar(select(Fight).where(Fight.id == fight_id))
    if fight is None:
        raise HTTPException(status_code=404, detail="Luta não encontrada")

    global worker, analysis_generation, last_analysis_frame
    analysis_generation += 1
    if worker is not None:
        last_analysis_frame = getattr(worker, "frame_idx", last_analysis_frame)
        worker.stop()
        if worker.is_alive():
            worker.join(timeout=5)
        worker = None
    hit_state.reset()
    latest.set(None)
    fight.status = "encerrada"
    fight.status_note = "Luta finalizada antes da análise ser completada; os dados podem estar incompletos."
    db.commit()
    db.refresh(fight)
    return {"fight_id": fight.id, "status": fight.status, "status_note": fight.status_note, "frame": last_analysis_frame}


@app.get("/")
def root():
    return {"status": "backend alive", "project": "HitTrack"}


@app.get("/start")
def start(conf: float = 0.5):
    if worker is None:
        create_worker(conf)
        return {"started": True, "paused": True}
    return {"running": True, "paused": worker.paused}


@app.get("/play")
def play():
    global worker
    if worker is None:
        create_worker()
    worker.paused = False
    return {"playing": True}


@app.get("/pause")
def pause():
    if worker is None:
        return {"paused": False, "reason": "no worker"}
    worker.paused = True
    return {"paused": True}


@app.get("/reset")
def reset(conf: float = 0.5):
    global worker, analysis_generation, last_analysis_frame
    analysis_generation += 1
    last_analysis_frame = 0
    if worker is not None:
        worker.stop()
        worker = None
    latest.set(None)
    create_worker(conf)
    return {"reset": True}


@app.get("/stop")
def stop():
    global worker, analysis_generation, last_analysis_frame
    analysis_generation += 1
    if worker is not None:
        last_analysis_frame = getattr(worker, "frame_idx", last_analysis_frame)
        worker.stop()
        worker = None
    hit_state.reset()
    latest.set(None)
    return {"stopped": True}


@app.get("/hits")
def get_hits():
    return hit_state.get_counts()


@app.get("/analysis/status")
def analysis_status():
    if worker is None:
        return {"active": False, "frame": last_analysis_frame, "paused": True, "hits": hit_state.get_counts()}
    return {
        "active": worker.is_alive(),
        "frame": getattr(worker, "frame_idx", 0),
        "paused": getattr(worker, "paused", True),
        "hits": hit_state.get_counts(),
    }


def mjpeg_stream():
    while True:
        frame = latest.get()
        if frame is None:
            time.sleep(0.01)
            continue
        ok, jpg = cv2.imencode(".jpg", frame)
        if ok:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg.tobytes() + b"\r\n"


@app.get("/stream")
def stream():
    return StreamingResponse(mjpeg_stream(), media_type="multipart/x-mixed-replace; boundary=frame")