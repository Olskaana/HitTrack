import threading


class HitState:
    def __init__(self):
        self._counts = {"lado_vermelho": 0, "lado_verde": 0}
        self._lock = threading.Lock()

    def reset(self):
        with self._lock:
            self._counts = {"lado_vermelho": 0, "lado_verde": 0}

    def add_hit(self, side: str):
        if side in self._counts:
            with self._lock:
                self._counts[side] += 1

    def get_counts(self):
        with self._lock:
            return dict(self._counts)
