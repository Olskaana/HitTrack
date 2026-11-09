import importlib
import sys
from types import ModuleType, SimpleNamespace

import numpy as np
import pytest
from fastapi import HTTPException

from models import Fight, HitEvent


class FakeWorker:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.paused = True
        self.frame_idx = 0
        self.stopped = False
        self.started = False
        self.alive = False

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def is_alive(self):
        return self.alive

    def join(self, timeout=None):
        self.join_timeout = timeout


@pytest.fixture
def main_module(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_PROJECT_DIR", str(tmp_path / "isolated-ai-project"))
    detector = ModuleType("detector")
    detector.CamWorker = FakeWorker
    monkeypatch.setitem(sys.modules, "detector", detector)
    sys.modules.pop("main", None)
    module = importlib.import_module("main")
    module.worker = None
    module.analysis_generation = 0
    module.last_analysis_frame = 0
    module.hit_state.reset()
    module.latest.set(None)
    yield module
    sys.modules.pop("main", None)


def create_fight(db_session, fight_id=2, **overrides):
    fight = Fight(
        id=fight_id,
        robot_red="Robo A",
        robot_green="Robo B",
        duration_seconds=60,
        fps=30,
        **overrides,
    )
    db_session.add(fight)
    db_session.commit()
    return fight


class FakeThread:
    def __init__(self, *, target, args=(), daemon=None):
        self.target = target
        self.args = args
        self.daemon = daemon
        self.started = False

    def start(self):
        self.started = True


def test_root_and_same_file(main_module, tmp_path):
    first = tmp_path / "first.mp4"
    second = tmp_path / "second.mp4"
    first.write_bytes(b"same video")
    second.write_bytes(b"same video")

    assert main_module.root() == {"status": "backend alive", "project": "HitTrack"}
    assert main_module.same_file(first, second)
    second.write_bytes(b"other video")
    assert not main_module.same_file(first, second)
    assert not main_module.same_file(first, tmp_path / "missing.mp4")


def test_same_file_rejects_files_with_different_sizes(main_module, tmp_path):
    first = tmp_path / "first.mp4"
    second = tmp_path / "second.mp4"
    first.write_bytes(b"short")
    second.write_bytes(b"longer")

    assert not main_module.same_file(first, second)


def test_startup_initializes_hittrack_database(main_module, monkeypatch):
    initialized = []
    monkeypatch.setattr(main_module, "init_db", lambda: initialized.append(True))

    main_module.startup()

    assert initialized == [True]


def test_load_reference_hits_handles_valid_and_invalid_files(main_module, tmp_path, capsys):
    hits_file = tmp_path / "hits.json"
    main_module.HITS_FILE = hits_file
    hits_file.write_text('[{"frame": 4}]', encoding="utf-8")
    assert main_module.load_reference_hits() == [{"frame": 4}]

    hits_file.write_text("{", encoding="utf-8")
    assert main_module.load_reference_hits() == []
    assert "Falha ao ler eventos rotulados" in capsys.readouterr().out


def test_load_reference_hits_handles_missing_file(main_module, tmp_path, capsys):
    main_module.HITS_FILE = tmp_path / "missing.json"

    assert main_module.load_reference_hits() == []
    assert "Falha ao ler eventos rotulados" in capsys.readouterr().out


def test_create_worker_loads_hits_and_starts_paused(main_module, tmp_path):
    hits_file = tmp_path / "hits.json"
    hits_file.write_text('[{"frame": 1}]', encoding="utf-8")
    main_module.HITS_FILE = hits_file
    main_module.VIDEO_SRC = tmp_path / "fight.mp4"

    main_module.create_worker(conf=0.7)

    assert isinstance(main_module.worker, FakeWorker)
    assert main_module.worker.kwargs["hits_map"] == [{"frame": 1}]
    assert main_module.worker.kwargs["conf"] == 0.7
    assert main_module.worker.paused
    assert main_module.worker.started
    assert main_module.active_video == main_module.VIDEO_SRC


def test_create_worker_stops_previous_and_handles_missing_hits(main_module, tmp_path, capsys):
    previous = FakeWorker()
    main_module.worker = previous
    main_module.HITS_FILE = tmp_path / "missing.json"

    main_module.create_worker(video_source=tmp_path / "selected.mp4")

    assert previous.stopped
    assert main_module.worker.kwargs["hits_map"] == []
    assert main_module.active_video == tmp_path / "selected.mp4"
    assert "Falha ao ler eventos da IA" in capsys.readouterr().out


def test_worker_controls_and_analysis_status(main_module, monkeypatch):
    created = []

    def create_worker(conf=0.5):
        worker = FakeWorker()
        created.append((conf, worker))
        main_module.worker = worker

    monkeypatch.setattr(main_module, "create_worker", create_worker)
    assert main_module.start(conf=0.8) == {"started": True, "paused": True}
    assert main_module.worker.kwargs == {}
    assert main_module.start() == {"running": True, "paused": True}
    assert main_module.pause() == {"paused": True}
    assert main_module.analysis_status()["active"] is False

    main_module.worker = None
    assert main_module.play() == {"playing": True}
    assert main_module.worker.paused is False
    main_module.worker.frame_idx = 12
    main_module.worker.alive = True
    assert main_module.analysis_status()["frame"] == 12
    assert main_module.analysis_status()["active"] is True
    assert main_module.pause() == {"paused": True}
    assert main_module.worker.paused is True
    assert main_module.get_hits() == {"lado_vermelho": 0, "lado_verde": 0}
    assert created[0][0] == 0.8


def test_pause_without_worker_and_play_with_existing_worker(main_module):
    assert main_module.pause() == {"paused": False, "reason": "no worker"}
    main_module.worker = FakeWorker()

    assert main_module.play() == {"playing": True}
    assert main_module.worker.paused is False


def test_reset_and_stop_clear_state_and_stop_active_worker(main_module, monkeypatch):
    created = []

    def create_worker(conf=0.5):
        worker = FakeWorker()
        created.append(worker)
        main_module.worker = worker

    monkeypatch.setattr(main_module, "create_worker", create_worker)
    main_module.worker = FakeWorker()
    main_module.latest.set(np.array([1]))
    main_module.analysis_generation = 3
    main_module.last_analysis_frame = 15

    assert main_module.reset(conf=0.6) == {"reset": True}
    assert main_module.worker is created[0]
    assert main_module.analysis_generation == 4
    assert main_module.last_analysis_frame == 0
    assert main_module.latest.get() is None

    main_module.worker.alive = True
    main_module.worker.frame_idx = 9
    assert main_module.stop() == {"stopped": True}
    assert main_module.worker is None
    assert created[0].stopped
    assert main_module.last_analysis_frame == 9
    assert main_module.latest.get() is None
    assert main_module.hit_state.get_counts() == {"lado_vermelho": 0, "lado_verde": 0}

    assert main_module.stop() == {"stopped": True}


def test_start_and_reset_stop_previous_worker(main_module, monkeypatch):
    old_worker = FakeWorker()
    main_module.worker = old_worker
    main_module.create_worker = lambda *_args, **_kwargs: setattr(
        main_module, "worker", FakeWorker()
    )

    result = main_module.reset()

    assert result == {"reset": True}
    assert old_worker.stopped


def test_analyze_fight_reports_missing_fight_or_video(main_module, db_session, tmp_path, monkeypatch):
    with pytest.raises(HTTPException) as missing_fight:
        main_module.analyze_fight(999, db_session)
    assert missing_fight.value.status_code == 404

    create_fight(db_session, fight_id=2)
    with pytest.raises(HTTPException) as missing_source:
        main_module.analyze_fight(2, db_session)
    assert missing_source.value.status_code == 400

    create_fight(db_session, fight_id=1)
    main_module.VIDEO_SRC = tmp_path / "missing.mp4"
    with pytest.raises(HTTPException) as missing_default_video:
        main_module.analyze_fight(1, db_session)
    assert missing_default_video.value.status_code == 400

    fight = db_session.get(Fight, 2)
    fight.video_source = str(tmp_path / "missing-associated.mp4")
    db_session.commit()
    with pytest.raises(HTTPException) as missing_associated_video:
        main_module.analyze_fight(2, db_session)
    assert missing_associated_video.value.status_code == 400


def test_analyze_fight_starts_background_worker_and_clears_old_hits(
    main_module, db_session, tmp_path, monkeypatch
):
    video = tmp_path / "fight.mp4"
    video.write_bytes(b"video")
    fight = create_fight(db_session, fight_id=5, video_source=str(video), video_filename="fight.mp4")
    db_session.add(HitEvent(fight_id=fight.id, frame=3, robot="Robo A"))
    db_session.commit()
    old_worker = FakeWorker()
    old_worker.alive = True
    main_module.worker = old_worker
    threads = []
    monkeypatch.setattr(
        main_module.threading,
        "Thread",
        lambda **kwargs: threads.append(FakeThread(**kwargs)) or threads[-1],
    )

    response = main_module.analyze_fight(fight.id, db_session)

    assert response == {"analysis_started": True, "fight_id": 5, "video": "fight.mp4"}
    assert old_worker.stopped
    assert old_worker.join_timeout == 5
    assert db_session.query(HitEvent).filter(HitEvent.fight_id == fight.id).count() == 0
    assert fight.status == "em_andamento"
    assert threads[0].started


def test_analyze_fight_uses_default_video_for_legacy_fight(
    main_module, db_session, tmp_path, monkeypatch
):
    video = tmp_path / "legacy.mp4"
    video.write_bytes(b"legacy")
    main_module.VIDEO_SRC = video
    create_fight(db_session, fight_id=1)
    monkeypatch.setattr(
        main_module.threading,
        "Thread",
        lambda **kwargs: FakeThread(**kwargs),
    )

    response = main_module.analyze_fight(1, db_session)

    assert response["video"] == video.name
    assert db_session.get(Fight, 1).video_source == str(video)


def test_stop_fight_persists_status_and_last_frame(main_module, db_session):
    fight = create_fight(db_session)
    db_session.add_all(
        [
            HitEvent(fight_id=fight.id, frame=10, robot="vermelho"),
            HitEvent(fight_id=fight.id, frame=20, robot="vermelho"),
            HitEvent(fight_id=fight.id, frame=30, robot="azul"),
        ]
    )
    db_session.commit()
    worker = FakeWorker()
    worker.alive = True
    worker.frame_idx = 14
    main_module.worker = worker
    main_module.latest.set(np.array([1]))
    main_module.hit_state.add_hit("lado_vermelho")

    response = main_module.stop_fight(fight.id, db_session)

    assert response["status"] == "encerrada"
    assert response["frame"] == 14
    assert response["winner_robot"] == "Robo A"
    assert response["hits_red"] == 2
    assert response["hits_green"] == 1
    assert response["status_note"]
    assert db_session.get(Fight, fight.id).duration_seconds == pytest.approx(14 / 30)
    assert worker.stopped
    assert worker.join_timeout == 5
    assert main_module.worker is None
    assert main_module.latest.get() is None
    assert db_session.get(Fight, fight.id).status == "encerrada"
    assert db_session.get(Fight, fight.id).winner_robot == "Robo A"

    with pytest.raises(HTTPException) as missing_fight:
        main_module.stop_fight(999, db_session)
    assert missing_fight.value.status_code == 404


def test_stop_fight_requires_manual_evaluation_when_hits_are_tied(main_module, db_session):
    fight = create_fight(db_session)
    db_session.add_all(
        [
            HitEvent(fight_id=fight.id, frame=10, robot="Robo A"),
            HitEvent(fight_id=fight.id, frame=20, robot="Robo B"),
        ]
    )
    db_session.commit()

    response = main_module.stop_fight(fight.id, db_session)

    assert response["hits_red"] == response["hits_green"] == 1
    assert response["winner_robot"] is None
    assert "Empate em hits" in response["status_note"]


def test_stop_fight_handles_worker_that_has_already_finished(main_module, db_session):
    fight = create_fight(db_session)
    worker = FakeWorker()
    worker.frame_idx = 6
    main_module.worker = worker

    response = main_module.stop_fight(fight.id, db_session)

    assert response["frame"] == 6
    assert worker.stopped
    assert not hasattr(worker, "join_timeout")


@pytest.mark.parametrize("use_reference_hits", [False, True])
def test_run_auto_analysis_persists_hits_and_finishes_fight(
    main_module, monkeypatch, use_reference_hits
):
    fight = SimpleNamespace(
        id=3,
        status="em_andamento",
        status_note="pending",
        robot_red="Robo A",
        robot_green="Robo B",
        duration_seconds=60,
        fps=30,
        robot_aliases={},
        hits=[],
        winner_robot=None,
        result=None,
    )
    scalar_calls = []
    session_events = []

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def scalar(self, _statement):
            scalar_calls.append(_statement)
            if len(scalar_calls) == 1:
                return None
            if len(scalar_calls) == 2:
                return object()
            return fight

        def add(self, event):
            session_events.append(event)
            fight.hits.append(event)

        def commit(self):
            session_events.append("commit")

    class FakeAnalysisWorker(FakeWorker):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.on_hit = kwargs["on_hit"]

        def start(self):
            self.started = True
            assert self.on_hit(10, "Robo A") is True
            assert self.on_hit(10, "Robo A") is False

    def start_thread(**kwargs):
        thread = FakeThread(**kwargs)
        thread.start = lambda: (setattr(thread, "started", True), thread.target(*thread.args))
        return thread

    monkeypatch.setattr(main_module, "SessionLocal", FakeSession)
    monkeypatch.setattr(main_module, "same_file", lambda *_args: use_reference_hits)
    monkeypatch.setattr(main_module, "load_reference_hits", lambda: [{"frame": 10}])
    monkeypatch.setattr(main_module, "AutoHitWorker", FakeAnalysisWorker)
    monkeypatch.setattr(main_module, "CamWorker", FakeAnalysisWorker)
    monkeypatch.setattr(main_module.threading, "Thread", start_thread)
    main_module.analysis_generation = 7

    main_module.run_auto_analysis("video.mp4", 3, ("Robo A", "Robo B"), 7)

    assert main_module.worker.started
    assert main_module.worker.paused is False
    assert main_module.worker.kwargs.get("hits_map") == (
        [{"frame": 10}] if use_reference_hits else None
    )
    assert len(session_events) == 3
    assert fight.status == "encerrada"
    assert fight.status_note is None
    assert fight.winner_robot == "Robo A"
    assert main_module.last_analysis_frame == 0


def test_run_auto_analysis_skips_finalization_for_stale_generation(main_module, monkeypatch):
    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def scalar(self, _statement):
            raise AssertionError("stale generations must not update the fight")

    class FakeThread(FakeWorker):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.target = kwargs["target"]
            self.args = kwargs["args"]

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr(main_module, "SessionLocal", FakeSession)
    monkeypatch.setattr(main_module, "same_file", lambda *_args: False)
    monkeypatch.setattr(main_module, "AutoHitWorker", FakeWorker)
    monkeypatch.setattr(main_module.threading, "Thread", FakeThread)
    main_module.analysis_generation = 2

    main_module.run_auto_analysis("video.mp4", 3, ("Robo A", "Robo B"), 1)

    assert main_module.worker.started


@pytest.mark.parametrize("fight_status", ["encerrada", None])
def test_run_auto_analysis_does_not_overwrite_finished_or_missing_fight(
    main_module, monkeypatch, fight_status
):
    fight = None if fight_status is None else SimpleNamespace(status=fight_status)

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def scalar(self, _statement):
            return fight

    class InlineThread:
        def __init__(self, *, target, args=(), daemon=None):
            self.target = target
            self.args = args

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr(main_module, "SessionLocal", FakeSession)
    monkeypatch.setattr(main_module, "same_file", lambda *_args: False)
    monkeypatch.setattr(main_module, "AutoHitWorker", FakeWorker)
    monkeypatch.setattr(main_module.threading, "Thread", InlineThread)
    main_module.analysis_generation = 5

    main_module.run_auto_analysis("video.mp4", 3, ("Robo A", "Robo B"), 5)

    assert main_module.worker.started
    if fight is not None:
        assert fight.status == "encerrada"


def test_stream_returns_mjpeg_response(main_module):
    response = main_module.stream()

    assert response.media_type == "multipart/x-mixed-replace; boundary=frame"


def test_mjpeg_stream_encodes_available_frames(main_module, monkeypatch):
    frame = np.array([1])
    main_module.latest.set(frame)
    monkeypatch.setattr(
        main_module.cv2,
        "imencode",
        lambda *_args: (True, SimpleNamespace(tobytes=lambda: b"jpeg")),
    )

    chunk = next(main_module.mjpeg_stream())

    assert chunk == b"--frame\r\nContent-Type: image/jpeg\r\n\r\njpeg\r\n"


def test_mjpeg_stream_skips_frames_that_cannot_be_encoded(main_module, monkeypatch):
    class EndStream(Exception):
        pass

    main_module.latest.set(np.array([1]))
    encodings = iter([(False, None), EndStream()])

    def encode(*_args):
        result = next(encodings)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(main_module.cv2, "imencode", encode)
    stream = main_module.mjpeg_stream()

    with pytest.raises(EndStream):
        next(stream)
