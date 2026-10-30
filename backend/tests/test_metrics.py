from types import SimpleNamespace

from metrics import calculate_metrics


def test_calculate_metrics_groups_aliases_and_thirds():
    fight = SimpleNamespace(
        id=1,
        duration_seconds=120,
        fps=30,
        robot_red="Robo Alfa",
        robot_green="Robo Beta",
        robot_aliases={"vermelho": "Robo Alfa", "azul": "Robo Beta"},
        hits=[
            SimpleNamespace(frame=0, robot="vermelho"),
            SimpleNamespace(frame=1200, robot="vermelho"),
            SimpleNamespace(frame=2400, robot="azul"),
        ],
    )

    result = calculate_metrics(fight)

    assert result.total_hits == 3
    assert result.robots[0].hits == 2
    assert result.robots[0].hits_per_minute == 1.0
    assert result.robots[0].third_distribution == [1, 1, 0]
    assert result.robots[1].third_distribution == [0, 0, 1]