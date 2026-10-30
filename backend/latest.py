import threading


class Latest:
    def __init__(self):
        self.frame = None
        self.lock = threading.Lock()

    def set(self, frame):
        with self.lock:
            self.frame = frame

    def get(self):
        with self.lock:
            return None if self.frame is None else self.frame.copy()
