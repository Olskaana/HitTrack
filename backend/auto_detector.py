import threading
import time
from collections.abc import Callable
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from hit_state import HitState


class AutoHitWorker(threading.Thread):
    """Reads a fight video, tracks two robots, and emits heuristic hit events."""

    def __init__(
        self,
        src: str | Path,
        weights: str | Path,
        latest,
        hit_state: HitState,
        robot_names: tuple[str, str],
        on_hit: Callable[[int, str], bool | None] | None = None,
        conf: float = 0.5,
    ):
        super().__init__(daemon=True)
        self.src = str(src)
        self.latest = latest
        self.hit_state = hit_state
        self.robot_names = robot_names
        self.on_hit = on_hit
        self.conf = conf
        self.imgsz = 960
        self.frame_period = 1 / 30
        self.stop_flag = False
        self.paused = True
        self.frame_idx = 0
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = YOLO(str(weights))
        self.model.to(self.device)
        self.previous_centers: dict[str, tuple[float, float] | None] = {
            "lado_vermelho": None,
            "lado_verde": None,
        }
        self.previous_gap: float | None = None
        self.last_hit_frame = -10_000
        self.cooldown_frames = 12
        self.contact_frames = 0
        self.was_in_contact = False
        self.approach_frames = 0
        self.pending_attacker: str | None = None
        self.class_to_side: dict[int, str] = {}

    @staticmethod
    def center(box):
        x1, y1, x2, y2 = box
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    @staticmethod
    def distance(first, second):
        return float(np.linalg.norm(np.subtract(first, second)))

    @staticmethod
    def gap(first, second):
        first_x1, first_y1, first_x2, first_y2 = first
        second_x1, second_y1, second_x2, second_y2 = second
        horizontal = max(first_x1 - second_x2, second_x1 - first_x2, 0)
        vertical = max(first_y1 - second_y2, second_y1 - first_y2, 0)
        return float(np.hypot(horizontal, vertical))

    def stop(self):
        self.stop_flag = True

    def detect(self, frame):
        results = self.model(frame, conf=min(self.conf, 0.1), imgsz=self.imgsz, verbose=False, device=self.device)
        best_by_class = {}
        for result in results:
            for box in result.boxes:
                coordinates = tuple(map(int, box.xyxy[0].tolist()))
                detection = {
                    "xyxy": coordinates,
                    "center": self.center(coordinates),
                    "class_id": int(box.cls[0]),
                    "confidence": float(box.conf[0]),
                }
                class_id = detection["class_id"]
                if class_id not in best_by_class or detection["confidence"] > best_by_class[class_id]["confidence"]:
                    best_by_class[class_id] = detection
        return sorted(best_by_class.values(), key=lambda item: item["confidence"], reverse=True)[:2]

    def assign(self, detections):
        if len(detections) < 2:
            return None
        if not self.class_to_side:
            for detection in sorted(detections, key=lambda item: item["center"][0]):
                side = "lado_vermelho" if not self.class_to_side else "lado_verde"
                self.class_to_side[detection["class_id"]] = side
        assigned = {}
        for detection in detections:
            side = self.class_to_side.get(detection["class_id"])
            if side:
                assigned[side] = detection
        return assigned if len(assigned) == 2 else None

    def register_hit(self, attacker: str):
        if self.frame_idx - self.last_hit_frame < self.cooldown_frames:
            return
        self.last_hit_frame = self.frame_idx
        robot = self.robot_names[0] if attacker == "lado_vermelho" else self.robot_names[1]
        if self.on_hit:
            accepted = self.on_hit(self.frame_idx, robot)
            if accepted is False:
                return
        self.hit_state.add_hit(attacker)

    def analyze_contact(self, assigned):
        red = assigned["lado_vermelho"]
        green = assigned["lado_verde"]
        current_gap = self.gap(red["xyxy"], green["xyxy"])
        red_center = red["center"]
        green_center = green["center"]
        previous_red = self.previous_centers["lado_vermelho"]
        previous_green = self.previous_centers["lado_verde"]
        closing = False
        attacker = "lado_vermelho"
        if previous_red and previous_green:
            previous_distance = self.distance(previous_red, previous_green)
            current_distance = self.distance(red_center, green_center)
            closing = current_distance < previous_distance - 0.5
            red_motion = self.distance(previous_red, red_center)
            green_motion = self.distance(previous_green, green_center)
            attacker = "lado_vermelho" if red_motion >= green_motion else "lado_verde"

        widths = [red["xyxy"][2] - red["xyxy"][0], green["xyxy"][2] - green["xyxy"][0]]
        contact_limit = max(12.0, min(widths) * 0.35)
        in_contact = current_gap <= contact_limit
        if closing:
            self.approach_frames += 1
            self.pending_attacker = attacker

        if in_contact:
            if self.approach_frames >= 1:
                self.was_in_contact = True
            self.contact_frames += 1
        elif self.was_in_contact:
            separating = self.previous_gap is not None and current_gap > self.previous_gap + 0.5
            if separating and self.pending_attacker:
                self.register_hit(self.pending_attacker)
            self.was_in_contact = False
            self.contact_frames = 0
            self.approach_frames = 0
            self.pending_attacker = None

        self.previous_gap = current_gap
        self.previous_centers["lado_vermelho"] = red_center
        self.previous_centers["lado_verde"] = green_center

    def run(self):
        capture = cv2.VideoCapture(self.src)
        if not capture.isOpened():
            print("[ERROR] Could not open fight video:", self.src)
            return
        try:
            while not self.stop_flag:
                if self.paused:
                    time.sleep(0.03)
                    continue
                frame_started = time.perf_counter()
                ok, frame = capture.read()
                if not ok:
                    break
                detections = self.detect(frame)
                assigned = self.assign(detections)
                if assigned:
                    self.analyze_contact(assigned)
                    for detection in assigned.values():
                        x1, y1, x2, y2 = detection["xyxy"]
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
                self.latest.set(frame)
                self.frame_idx += 1
                time.sleep(max(0, self.frame_period - (time.perf_counter() - frame_started)))
        finally:
            capture.release()
