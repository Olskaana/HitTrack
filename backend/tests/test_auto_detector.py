from types import SimpleNamespace

import numpy as np

import auto_detector
from auto_detector import AutoHitWorker
from hit_state import HitState
from latest import Latest


class FakeModel:
    def __init__(self, detections=None):
        self.detections = detections or []

    def to(self, device):
        self.device = device

    def __call__(self, *args, **kwargs):
        return [SimpleNamespace(boxes=self.detections)]


def create_worker(monkeypatch, *, detections=None, on_hit=None):
    model = FakeModel(detections)
    monkeypatch.setattr(auto_detector, "YOLO", lambda _: model)
    worker = AutoHitWorker(
        src="unused.mp4",
        weights="unused.pt",
        latest=Latest(),
        hit_state=HitState(),
        robot_names=("Robo A", "Robo B"),
        on_hit=on_hit,
    )
    return worker


def detection(class_id, confidence, coordinates):
    return SimpleNamespace(
        xyxy=[np.array(coordinates)],
        cls=np.array([class_id]),
        conf=np.array([confidence]),
    )


def test_geometry_helpers():
    assert AutoHitWorker.center((0, 2, 4, 6)) == (2, 4)
    assert AutoHitWorker.distance((0, 0), (3, 4)) == 5
    assert AutoHitWorker.gap((0, 0, 10, 10), (15, 14, 20, 20)) == np.hypot(5, 4)
    assert AutoHitWorker.gap((0, 0, 10, 10), (5, 5, 20, 20)) == 0


def test_detect_keeps_highest_confidence_per_class_and_limits_to_two(monkeypatch):
    worker = create_worker(
        monkeypatch,
        detections=[
            detection(1, 0.6, (0, 0, 10, 10)),
            detection(1, 0.9, (1, 1, 11, 11)),
            detection(2, 0.8, (20, 0, 30, 10)),
            detection(3, 0.7, (40, 0, 50, 10)),
        ],
    )

    result = worker.detect(np.zeros((1, 1)))

    assert [item["class_id"] for item in result] == [1, 2]
    assert result[0]["xyxy"] == (1, 1, 11, 11)


def test_detect_keeps_current_best_when_duplicate_confidence_is_lower(monkeypatch):
    worker = create_worker(
        monkeypatch,
        detections=[
            detection(1, 0.9, (1, 1, 11, 11)),
            detection(1, 0.6, (0, 0, 10, 10)),
        ],
    )

    result = worker.detect(np.zeros((1, 1)))

    assert len(result) == 1
    assert result[0]["confidence"] == 0.9
    assert result[0]["xyxy"] == (1, 1, 11, 11)


def test_detect_returns_empty_list_when_model_finds_no_boxes(monkeypatch):
    worker = create_worker(monkeypatch)

    assert worker.detect(np.zeros((1, 1))) == []


def test_assign_maps_left_and_right_classes_once(monkeypatch):
    worker = create_worker(monkeypatch)
    detections = [
        {"class_id": 4, "center": (40, 0)},
        {"class_id": 8, "center": (10, 0)},
    ]

    assert worker.assign(detections[:1]) is None
    assigned = worker.assign(detections)

    assert assigned["lado_vermelho"]["class_id"] == 8
    assert assigned["lado_verde"]["class_id"] == 4
    assert worker.assign(list(reversed(detections)))["lado_vermelho"]["class_id"] == 8


def test_assign_rejects_unmapped_detection_classes(monkeypatch):
    worker = create_worker(monkeypatch)
    worker.class_to_side = {1: "lado_vermelho", 2: "lado_verde"}

    assigned = worker.assign(
        [
            {"class_id": 1, "center": (10, 0)},
            {"class_id": 99, "center": (20, 0)},
        ]
    )

    assert assigned is None


def test_register_hit_respects_callback_and_cooldown(monkeypatch):
    accepted_hits = []
    worker = create_worker(monkeypatch, on_hit=lambda frame, robot: accepted_hits.append((frame, robot)))
    worker.frame_idx = 10
    worker.register_hit("lado_vermelho")
    worker.frame_idx = 21
    worker.register_hit("lado_verde")
    worker.frame_idx = 22
    worker.register_hit("lado_verde")

    assert accepted_hits == [(10, "Robo A"), (22, "Robo B")]
    assert worker.hit_state.get_counts() == {"lado_vermelho": 1, "lado_verde": 1}

    rejected = create_worker(monkeypatch, on_hit=lambda *_: False)
    rejected.frame_idx = 1
    rejected.register_hit("lado_vermelho")
    assert rejected.hit_state.get_counts()["lado_vermelho"] == 0


def test_register_hit_counts_event_when_no_callback_is_configured(monkeypatch):
    worker = create_worker(monkeypatch)

    worker.register_hit("lado_verde")

    assert worker.hit_state.get_counts() == {"lado_vermelho": 0, "lado_verde": 1}


def test_analyze_contact_registers_hit_after_approach_and_separation(monkeypatch):
    worker = create_worker(monkeypatch)
    assigned = {
        "lado_vermelho": {"xyxy": (0, 0, 10, 10), "center": (5, 5)},
        "lado_verde": {"xyxy": (30, 0, 40, 10), "center": (35, 5)},
    }

    worker.analyze_contact(assigned)
    worker.frame_idx += 1
    assigned["lado_vermelho"] = {"xyxy": (5, 0, 15, 10), "center": (10, 5)}
    assigned["lado_verde"] = {"xyxy": (25, 0, 35, 10), "center": (30, 5)}
    worker.analyze_contact(assigned)
    worker.frame_idx += 1
    assigned["lado_verde"] = {"xyxy": (30, 0, 40, 10), "center": (35, 5)}
    worker.analyze_contact(assigned)

    assert worker.hit_state.get_counts()["lado_vermelho"] == 1
    assert worker.was_in_contact is False
    assert worker.pending_attacker is None


def test_analyze_contact_identifies_green_attacker(monkeypatch):
    worker = create_worker(monkeypatch)
    assigned = {
        "lado_vermelho": {"xyxy": (0, 0, 10, 10), "center": (5, 5)},
        "lado_verde": {"xyxy": (35, 0, 45, 10), "center": (40, 5)},
    }

    worker.analyze_contact(assigned)
    worker.frame_idx += 1
    assigned["lado_verde"] = {"xyxy": (15, 0, 25, 10), "center": (20, 5)}
    worker.analyze_contact(assigned)
    worker.frame_idx += 1
    assigned["lado_verde"] = {"xyxy": (25, 0, 35, 10), "center": (30, 5)}
    worker.analyze_contact(assigned)

    assert worker.hit_state.get_counts() == {"lado_vermelho": 0, "lado_verde": 1}


def test_analyze_contact_does_not_count_stationary_contact(monkeypatch):
    worker = create_worker(monkeypatch)
    assigned = {
        "lado_vermelho": {"xyxy": (0, 0, 10, 10), "center": (5, 5)},
        "lado_verde": {"xyxy": (5, 0, 15, 10), "center": (10, 5)},
    }

    worker.analyze_contact(assigned)
    worker.frame_idx += 1
    assigned["lado_verde"] = {"xyxy": (20, 0, 30, 10), "center": (25, 5)}
    worker.analyze_contact(assigned)

    assert worker.hit_state.get_counts() == {"lado_vermelho": 0, "lado_verde": 0}


def test_run_reports_unreadable_video(monkeypatch, capsys):
    class Capture:
        def isOpened(self):
            return False

    monkeypatch.setattr(auto_detector.cv2, "VideoCapture", lambda _: Capture())
    worker = create_worker(monkeypatch)

    worker.run()

    assert "Could not open fight video" in capsys.readouterr().out


def test_run_processes_and_draws_detections(monkeypatch):
    class Capture:
        def __init__(self):
            self.frames = iter([(True, np.zeros((2, 2, 3))), (False, None)])
            self.released = False

        def isOpened(self):
            return True

        def read(self):
            return next(self.frames)

        def release(self):
            self.released = True

    capture = Capture()
    monkeypatch.setattr(auto_detector.cv2, "VideoCapture", lambda _: capture)
    rectangles = []
    monkeypatch.setattr(auto_detector.cv2, "rectangle", lambda *args: rectangles.append(args))
    monkeypatch.setattr(auto_detector.time, "sleep", lambda _: None)
    worker = create_worker(monkeypatch)
    worker.paused = False
    worker.detect = lambda _frame: [
        {"xyxy": (0, 0, 1, 1), "center": (0.5, 0.5), "class_id": 1},
        {"xyxy": (1, 1, 2, 2), "center": (1.5, 1.5), "class_id": 2},
    ]
    worker.analyze_contact = lambda _assigned: None

    worker.run()

    assert capture.released
    assert worker.frame_idx == 1
    assert worker.latest.get().shape == (2, 2, 3)
    assert len(rectangles) == 2


def test_run_updates_frame_without_robot_assignments(monkeypatch):
    class Capture:
        def __init__(self):
            self.frames = iter([(True, np.zeros((2, 2, 3))), (False, None)])

        def isOpened(self):
            return True

        def read(self):
            return next(self.frames)

        def release(self):
            pass

    monkeypatch.setattr(auto_detector.cv2, "VideoCapture", lambda _: Capture())
    monkeypatch.setattr(auto_detector.time, "sleep", lambda _: None)
    worker = create_worker(monkeypatch)
    worker.paused = False

    worker.run()

    assert worker.frame_idx == 1
    assert worker.latest.get() is not None





def test_run_releases_capture_when_video_ends(monkeypatch):
    class Capture:
        released = False

        def isOpened(self):
            return True

        def read(self):
            return False, None

        def release(self):
            self.released = True

    capture = Capture()
    monkeypatch.setattr(auto_detector.cv2, "VideoCapture", lambda _: capture)
    worker = create_worker(monkeypatch)
    worker.paused = False

    worker.run()

    assert capture.released
    assert worker.frame_idx == 0


def test_stop_sets_stop_flag(monkeypatch):
    worker = create_worker(monkeypatch)

    worker.stop()

    assert worker.stop_flag
