import numpy as np

from hit_state import HitState
from latest import Latest


def test_hit_state_counts_only_known_sides_and_resets():
    state = HitState()

    state.add_hit("lado_vermelho")
    state.add_hit("lado_verde")
    state.add_hit("lado_azul")

    assert state.get_counts() == {"lado_vermelho": 1, "lado_verde": 1}
    state.reset()
    assert state.get_counts() == {"lado_vermelho": 0, "lado_verde": 0}


def test_latest_returns_a_copy_and_can_be_cleared():
    latest = Latest()
    assert latest.get() is None

    frame = np.array([[1, 2], [3, 4]])
    latest.set(frame)
    returned = latest.get()
    returned[0, 0] = 99

    assert latest.get()[0, 0] == 1
    latest.set(None)
    assert latest.get() is None
