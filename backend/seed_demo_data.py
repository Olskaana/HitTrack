import argparse
import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Fight, HitEvent


DEMO_COMPETITION_PREFIX = "DEMO HitTrack"
DEMO_FIGHT_COUNT = 12
REALISTIC_FIGHT_COUNT = 72
REALISTIC_DEMO_NOTE = (
    "Dado fictício de demonstração — não corresponde a combate ou resultado oficial."
)
CATEGORIES = (
    "fairyweight",
    "termiteweight",
    "antweight",
    "pastic-ant",
    "beetleweight",
    "hobbyweight",
    "featherweight",
    "lightweight",
    "middleweight",
    "heavyweight",
)
FICTIONAL_ROBOTS = (
    "Aço Nômade",
    "Arraia de Ferro",
    "Bicho-Papão",
    "Brasa Negra",
    "Carcará MK-II",
    "Cérbero",
    "Dente-de-Sabre",
    "Ferro-Velho",
    "Fúria do Sul",
    "Guará de Aço",
    "Jaguar do Vale",
    "Jagunço",
    "Lobo Mecânico",
    "Marreta X",
    "Morcego de Aço",
    "Naja 2.0",
    "Ragnarok",
    "Trovão Azul",
    "Urutu",
    "Vulcano",
    "Ciclone",
    "Pé-de-Chumbo",
    "Sentinela",
    "Tempestade",
)
FICTIONAL_TEAMS = (
    "Oficina Vento Sul",
    "Forja do Vale",
    "Equipe Carcará",
    "Engrenagem Sul",
    "Garagem 42",
    "Iron Forge Robotics",
    "Litoral Bots",
    "Mecânica Autônoma",
    "Núcleo Robótico Serra",
    "Oficina Titan",
    "Projeto Jaguatirica",
    "Robótica Horizonte",
)
FICTIONAL_COMPETITIONS = (
    "Copa Vale do Aço",
    "Circuito Catarinense de Robôs",
    "Arena de Combate Sul",
    "Torneio Metal Forte",
    "Copa Litoral de Robótica",
    "Liga dos Construtores",
    "Desafio da Forja",
    "Copa Titan Bot",
    "Circuito Nacional de Mini-Robôs",
    "Batalha dos Autônomos",
    "Copa Serra Robótica",
    "Arena Ferro & Fogo",
    "Open de Combate do Vale",
    "Taça Engrenagem",
    "Torneio Garra Mecânica",
    "Festival de Robôs de Joinville",
    "Desafio dos Construtores",
    "Circuito Arena 360",
)


def build_demo_fights(db: Session) -> list[Fight]:
    existing_fights = db.scalars(select(Fight).order_by(Fight.id)).all()
    existing_competitions = {fight.competition for fight in existing_fights}
    competition_names = [
        f"{DEMO_COMPETITION_PREFIX} {index + 1:02d}"
        for index in range(DEMO_FIGHT_COUNT)
    ]
    missing_indices = [
        index for index, name in enumerate(competition_names)
        if name not in existing_competitions
    ]
    if not missing_indices:
        return []

    robots = sorted({
        robot
        for fight in existing_fights
        for robot in (fight.robot_red, fight.robot_green)
        if robot
    })
    teams = sorted({
        team
        for fight in existing_fights
        for team in (fight.team_red, fight.team_green)
        if team
    })
    if len(robots) < 12 or len(teams) < 12:
        raise ValueError(
            "São necessários ao menos 12 robôs e 12 equipes já cadastrados "
            f"para gerar dados de demonstração; encontrados {len(robots)} robôs "
            f"e {len(teams)} equipes."
        )

    demo_fights = []
    for index in missing_indices:
        robot_red = robots[index % len(robots)]
        robot_green = robots[(index + 7) % len(robots)]
        team_red = teams[index % len(teams)]
        team_green = teams[(index + 5) % len(teams)]
        hits_red = 5 + (index * 3) % 12
        hits_green = 3 + (index * 5) % 10
        if hits_red == hits_green:
            hits_green += 1

        duration_seconds = 180.0
        fps = 30.0
        duration_frames = int(duration_seconds * fps)
        winner_robot = robot_red if hits_red > hits_green else robot_green
        demo_fight = Fight(
            competition=competition_names[index],
            fought_at=datetime(2026, 1, 1) + timedelta(days=index * 18),
            robot_red=robot_red,
            robot_green=robot_green,
            team_red=team_red,
            team_green=team_green,
            category=CATEGORIES[index % len(CATEGORIES)],
            status="encerrada",
            status_note="Luta sintética para demonstração; não representa combate real.",
            result="vitoria",
            winner_robot=winner_robot,
            duration_seconds=duration_seconds,
            fps=fps,
            elo_red=900 + index * 23,
            elo_green=940 + index * 17,
            robot_aliases={"vermelho": robot_red, "azul": robot_green},
            is_test=True,
        )
        demo_fight.hits = [
            HitEvent(
                frame=min(int((hit_index + 1) * duration_frames / (count + 1)), duration_frames - 1),
                robot=robot,
            )
            for robot, count in ((robot_red, hits_red), (robot_green, hits_green))
            for hit_index in range(count)
        ]
        demo_fights.append(demo_fight)
    return demo_fights


def build_realistic_demo_fights(db: Session) -> list[Fight]:
    competition_names = [f"{competition} 2025" for competition in FICTIONAL_COMPETITIONS]
    existing_counts = {
        competition: 0
        for competition in competition_names
    }
    for competition in db.scalars(
        select(Fight.competition).where(Fight.competition.in_(competition_names))
    ):
        existing_counts[competition] += 1
    pending = [
        (competition_index, fight_index)
        for competition_index, competition in enumerate(FICTIONAL_COMPETITIONS)
        for fight_index in range(existing_counts[f"{competition} 2025"], 4)
    ]
    if not pending:
        return []

    rng = random.Random(20261104)
    duration_seconds = 180.0
    fps = 30.0
    duration_frames = int(duration_seconds * fps)
    fights = []
    for competition_index, fight_index in pending:
        sequence = competition_index * 4 + fight_index
        red_index = (sequence * 5 + competition_index) % len(FICTIONAL_ROBOTS)
        green_index = (sequence * 7 + 11) % len(FICTIONAL_ROBOTS)
        if red_index == green_index:
            green_index = (green_index + 1) % len(FICTIONAL_ROBOTS)

        red_skill = 9 + (red_index % 7) * 1.35
        green_skill = 9 + (green_index % 7) * 1.35
        red_hits = max(3, round(rng.gauss(red_skill, 3.2)))
        green_hits = max(3, round(rng.gauss(green_skill, 3.2)))
        if red_hits == green_hits:
            red_hits += 1
        winner_robot = (
            FICTIONAL_ROBOTS[red_index]
            if red_hits > green_hits
            else FICTIONAL_ROBOTS[green_index]
        )
        fight = Fight(
            competition=f"{FICTIONAL_COMPETITIONS[competition_index]} 2025",
            fought_at=datetime(2025, 1, 11) + timedelta(days=sequence * 5 + fight_index),
            robot_red=FICTIONAL_ROBOTS[red_index],
            robot_green=FICTIONAL_ROBOTS[green_index],
            team_red=FICTIONAL_TEAMS[red_index // 2],
            team_green=FICTIONAL_TEAMS[green_index // 2],
            category=CATEGORIES[sequence % len(CATEGORIES)],
            status="encerrada",
            status_note=REALISTIC_DEMO_NOTE,
            result="vitoria",
            winner_robot=winner_robot,
            duration_seconds=duration_seconds,
            fps=fps,
            elo_red=850 + red_index * 31 + rng.randrange(-35, 36),
            elo_green=850 + green_index * 31 + rng.randrange(-35, 36),
            robot_aliases={
                "vermelho": FICTIONAL_ROBOTS[red_index],
                "azul": FICTIONAL_ROBOTS[green_index],
            },
            is_test=False,
        )

        events = []
        for robot_index, robot, hit_count in (
            (red_index, fight.robot_red, red_hits),
            (green_index, fight.robot_green, green_hits),
        ):
            style = robot_index % 3
            beta_shapes = ((0.85, 1.8), (1.7, 1.7), (1.8, 0.85))
            alpha, beta = beta_shapes[style]
            robot_rng = random.Random(sequence * 1000 + robot_index)
            for _ in range(hit_count):
                frame = int(robot_rng.betavariate(alpha, beta) * (duration_frames - 1))
                events.append(HitEvent(frame=frame, robot=robot))
        fight.hits = events
        fights.append(fight)
    return fights


def main() -> None:
    parser = argparse.ArgumentParser(description="Cria lutas e competições sintéticas para demonstração.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Insere os dados no banco; sem esta opção, apenas lista o que seria criado.",
    )
    parser.add_argument(
        "--include-test-data",
        action="store_true",
        help="Também cria as 12 lutas antigas de teste usando robôs/equipes já cadastrados.",
    )
    args = parser.parse_args()

    with SessionLocal() as db:
        realistic_fights = build_realistic_demo_fights(db)
        demo_fights = build_demo_fights(db) if args.include_test_data else []
        all_fights = [*realistic_fights, *demo_fights]
        if not all_fights:
            print("Os dados de demonstração já estão completos; nenhuma luta foi criada.")
            return
        if not args.apply:
            print(
                f"Prévia: {len(realistic_fights)} lutas fictícias visíveis por padrão e "
                f"{len(demo_fights)} lutas de teste."
            )
            for fight in all_fights:
                print(f"- {fight.competition}: {fight.robot_red} × {fight.robot_green}")
            print("Execute novamente com --apply para inserir os dados.")
            return

        db.add_all(all_fights)
        db.commit()
        print(
            f"{len(realistic_fights)} lutas fictícias inseridas como dados normais e "
            f"{len(demo_fights)} lutas inseridas como testes."
        )


if __name__ == "__main__":
    main()
