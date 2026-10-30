import math
from collections import defaultdict
from datetime import date
from statistics import mean, stdev
from typing import Any

from models import Fight


OUTCOMES = ("vitoria", "derrota")


def filter_fights(
    fights: list[Fight],
    start_date: date | None = None,
    end_date: date | None = None,
    category: str | None = None,
    competition: str | None = None,
    robot: str | None = None,
    team: str | None = None,
) -> list[Fight]:
    selected = []
    for fight in fights:
        if category and fight.category != category:
            continue
        if competition and fight.competition != competition:
            continue
        if robot and robot not in {fight.robot_red, fight.robot_green}:
            continue
        if team and team not in {fight.team_red, fight.team_green}:
            continue
        if start_date or end_date:
            fight_datetime = fight.fought_at or getattr(fight, "created_at", None)
            if fight_datetime is None:
                continue
            fight_date = fight_datetime.date() if hasattr(fight_datetime, "date") else fight_datetime
            if start_date and fight_date < start_date:
                continue
            if end_date and fight_date > end_date:
                continue
        selected.append(fight)
    return selected


def _normalize_robot(fight: Fight, robot: str) -> str:
    aliases = fight.robot_aliases or {}
    return aliases.get(robot, {"vermelho": fight.robot_red, "azul": fight.robot_green}.get(robot, robot))


def _outcome(fight: Fight, robot: str) -> str | None:
    if fight.winner_robot == robot:
        return "vitoria"
    if fight.winner_robot in {fight.robot_red, fight.robot_green}:
        return "derrota"
    return None


def _correlation(values: list[tuple[float, float]]) -> dict[str, Any]:
    observations = len(values)
    if observations < 3:
        return {"observations": observations, "pearson": None, "spearman": None}

    xs, ys = zip(*values)
    pearson = _pearson(list(xs), list(ys))
    spearman = _pearson(_ranks(list(xs)), _ranks(list(ys)))
    return {
        "observations": observations,
        "pearson": round(pearson, 6) if pearson is not None else None,
        "spearman": round(spearman, 6) if spearman is not None else None,
    }


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 2:
        return None
    mean_x = mean(xs)
    mean_y = mean(ys)
    sum_x = sum((value - mean_x) ** 2 for value in xs)
    sum_y = sum((value - mean_y) ** 2 for value in ys)
    if sum_x == 0 or sum_y == 0:
        return None
    covariance = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    return covariance / math.sqrt(sum_x * sum_y)


def _ranks(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and ordered[end][1] == ordered[index][1]:
            end += 1
        average_rank = (index + 1 + end) / 2
        for position in range(index, end):
            ranks[ordered[position][0]] = average_rank
        index = end
    return ranks


def _new_aggregate() -> dict[str, Any]:
    return {
        "hits": [],
        "duration_seconds": 0.0,
        "outcomes": {outcome: [] for outcome in OUTCOMES},
        "elo_pairs": [],
        "robots": set(),
    }


def _summarize(
    name: str,
    aggregate: dict[str, Any],
    include_correlation: bool,
) -> dict[str, Any]:
    hit_counts = aggregate["hits"]
    total_hits = sum(hit_counts)
    outcome_counts = aggregate["outcomes"]
    wins = len(outcome_counts["vitoria"])
    losses = len(outcome_counts["derrota"])
    fight_count = len(hit_counts)
    duration_seconds = aggregate["duration_seconds"]
    summary = {
        "fight_count": fight_count,
        "wins": wins,
        "losses": losses,
        "total_hits": total_hits,
        "average_hits_per_fight": round(total_hits / fight_count, 3) if fight_count else 0.0,
        "hits_per_minute": round(total_hits / duration_seconds * 60, 3) if duration_seconds else 0.0,
        "sample_stddev_hits": round(stdev(hit_counts), 3) if fight_count >= 2 else None,
        "outcomes": [
            {
                "outcome": outcome,
                "fight_count": len(outcome_counts[outcome]),
                "average_hits": round(mean(outcome_counts[outcome]), 3)
                if outcome_counts[outcome]
                else 0.0,
            }
            for outcome in OUTCOMES
        ],
    }
    if include_correlation:
        summary.update(
            robot=name,
            elo_correlation=_correlation(aggregate["elo_pairs"]),
        )
    else:
        summary.update(team=name, robot_count=len(aggregate["robots"]))
    return summary


def calculate_analytics(fights: list[Fight]) -> dict[str, Any]:
    robots: dict[str, dict[str, Any]] = defaultdict(_new_aggregate)
    teams: dict[str, dict[str, Any]] = defaultdict(_new_aggregate)
    samples = []

    for fight in fights:
        normalized_hits: dict[str, int] = defaultdict(int)
        for hit in fight.hits:
            normalized_hits[_normalize_robot(fight, hit.robot)] += 1

        sides = (
            (fight.robot_red, fight.team_red, fight.elo_red),
            (fight.robot_green, fight.team_green, fight.elo_green),
        )
        side_data = []
        for robot, team, elo in sides:
            hits = normalized_hits[robot]
            outcome = _outcome(fight, robot)
            side_data.append((robot, team, hits, elo, outcome))

            robot_aggregate = robots[robot]
            robot_aggregate["hits"].append(hits)
            robot_aggregate["duration_seconds"] += fight.duration_seconds
            robot_aggregate["robots"].add(robot)
            if outcome:
                robot_aggregate["outcomes"][outcome].append(hits)
            if elo is not None and math.isfinite(float(elo)):
                robot_aggregate["elo_pairs"].append((float(elo), float(hits)))

            if team:
                team_aggregate = teams[team]
                team_aggregate["hits"].append(hits)
                team_aggregate["duration_seconds"] += fight.duration_seconds
                team_aggregate["robots"].add(robot)
                if outcome:
                    team_aggregate["outcomes"][outcome].append(hits)

        red, green = side_data
        samples.append(
            {
                "fight_id": fight.id,
                "fought_at": fight.fought_at,
                "category": fight.category,
                "competition": fight.competition,
                "robot_red": red[0],
                "robot_green": green[0],
                "team_red": red[1],
                "team_green": green[1],
                "hits_red": red[2],
                "hits_green": green[2],
                "elo_red": red[3],
                "elo_green": green[3],
                "outcome_red": red[4],
                "outcome_green": green[4],
            }
        )

    return {
        "fight_count": len(fights),
        "robots": [
            _summarize(name, aggregate, include_correlation=True)
            for name, aggregate in sorted(robots.items())
        ],
        "teams": [
            _summarize(name, aggregate, include_correlation=False)
            for name, aggregate in sorted(teams.items())
        ],
        "fights": samples,
    }
