from models import Fight
from schemas import FightMetrics, RobotMetrics


def normalize_robot(fight: Fight, robot: str) -> str:
    aliases = fight.robot_aliases or {}
    return aliases.get(robot, {"vermelho": fight.robot_red, "azul": fight.robot_green}.get(robot, robot))


def calculate_metrics(fight: Fight) -> FightMetrics:
    grouped: dict[str, list[int]] = {}
    for event in fight.hits:
        grouped.setdefault(normalize_robot(fight, event.robot), []).append(event.frame)

    duration_frames = max(fight.duration_seconds * fight.fps, 1)
    metrics = []
    for robot in (fight.robot_red, fight.robot_green):
        frames = grouped.get(robot, [])
        thirds = [0, 0, 0]
        for frame in frames:
            thirds[min(int(frame / duration_frames * 3), 2)] += 1
        metrics.append(
            RobotMetrics(
                robot=robot,
                hits=len(frames),
                hits_per_minute=round(len(frames) / fight.duration_seconds * 60, 3),
                third_distribution=thirds,
            )
        )

    return FightMetrics(
        fight_id=fight.id,
        duration_seconds=fight.duration_seconds,
        total_hits=sum(len(frames) for frames in grouped.values()),
        robots=metrics,
    )


def apply_hit_result(fight: Fight) -> tuple[int, int]:
    metrics = calculate_metrics(fight)
    hits_red, hits_green = (robot.hits for robot in metrics.robots)
    if hits_red == hits_green:
        fight.winner_robot = None
        fight.result = None
        fight.status_note = (
            f"Empate em hits ({hits_red} a {hits_green}); "
            "o resultado precisa ser avaliado manualmente."
        )
    else:
        winner = fight.robot_red if hits_red > hits_green else fight.robot_green
        fight.winner_robot = winner
        fight.result = "vitoria"
    return hits_red, hits_green