import re
import logging
import time
import threading
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from database import SessionLocal
from models import RankingEntry, RankingSnapshot


RANKING_BASE_URL = "https://rank.robocore.net"
RANKING_CATEGORIES = {
    "fairyweight": "Fairyweight",
    "termiteweight": "Cupim",
    "antweight": "Antweight",
    "pastic-ant": "Plastic Ant",
    "beetleweight": "Beetleweight",
    "hobbyweight": "Hobbyweight",
    "featherweight": "Featherweight",
    "lightweight": "Lightweight",
    "middleweight": "Middleweight",
    "heavyweight": "Heavyweight",
}
REQUEST_INTERVAL_SECONDS = 1
REFRESH_INTERVAL_SECONDS = 24 * 60 * 60
SCHEDULER_CHECK_INTERVAL_SECONDS = 60 * 60
_scheduler_lock = threading.Lock()
_scheduler_started = False


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class RankingImportError(ValueError):
    pass


class _RankingHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[dict[str, object]]] = []
        self._row: list[dict[str, object]] | None = None
        self._cell: dict[str, object] | None = None
        self._link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = {"text": [], "links": []}
            self._row.append(self._cell)
        elif tag == "a" and self._cell is not None:
            self._link = {"href": attributes.get("href") or "", "text": ""}
        elif tag == "br" and self._cell is not None:
            self._cell["text"].append(" ")

    def handle_data(self, data: str) -> None:
        if self._cell is None:
            return
        self._cell["text"].append(data)
        if self._link is not None:
            self._link["text"] += data

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._link is not None and self._cell is not None:
            self._cell["links"].append(self._link)
            self._link = None
        elif tag in {"td", "th"}:
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None


def parse_ranking_html(html: str, category: str) -> list[dict[str, object]]:
    if category not in RANKING_CATEGORIES:
        raise RankingImportError(f"Categoria de ranking não suportada: {category}")

    parser = _RankingHTMLParser()
    parser.feed(html)
    entries = []
    for cells in parser.rows:
        if len(cells) < 6:
            continue
        values = [" ".join(cell["text"]).strip() for cell in cells]
        rank_match = re.match(r"\s*(\d+)", values[0])
        history_link = next(
            (
                link
                for link in cells[2]["links"]
                if re.fullmatch(r"/history/\d+/?", urlparse(link["href"]).path)
            ),
            None,
        )
        if not rank_match or history_link is None:
            continue

        score_match = re.search(r"\d+(?:[.,]\d+)?", values[1])
        fights_match = re.search(r"\d+", values[3])
        record_match = re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*", values[4])
        if not score_match or not fights_match or not record_match:
            raise RankingImportError(f"Linha inválida no ranking de {category}: {values!r}")

        robot_name = " ".join(history_link["text"].split())
        team_name = " ".join(values[2].replace(history_link["text"], "", 1).split()).strip()
        try:
            elo_score = float(score_match.group().replace(",", "."))
        except ValueError as error:
            raise RankingImportError(
                f"Pontuação inválida no ranking de {category}: {values!r}"
            ) from error
        try:
            latest_fight_at = datetime.fromisoformat(values[5]) if values[5] else None
        except ValueError as error:
            raise RankingImportError(
                f"Data inválida no ranking de {category}: {values!r}"
            ) from error
        if not robot_name:
            raise RankingImportError(f"Robô sem nome no ranking de {category}.")

        robot_source_id = int(urlparse(history_link["href"]).path.strip("/").split("/")[-1])
        entries.append(
            {
                "rank_position": int(rank_match.group(1)),
                "elo_score": elo_score,
                "robot_name": robot_name,
                "team_name": team_name or None,
                "robot_source_id": robot_source_id,
                "total_fights": int(fights_match.group()),
                "wins": int(record_match.group(1)),
                "losses": int(record_match.group(2)),
                "latest_fight_at": latest_fight_at,
                "robot_url": urljoin(RANKING_BASE_URL, history_link["href"]),
            }
        )

    if not entries:
        raise RankingImportError(
            f"Nenhum registro de ranking foi reconhecido para {category}; "
            "o formato da página pode ter mudado."
        )
    return entries


def fetch_ranking(category: str) -> list[dict[str, object]]:
    if category not in RANKING_CATEGORIES:
        raise RankingImportError(f"Categoria de ranking não suportada: {category}")

    source_url = f"{RANKING_BASE_URL}/{category}"
    try:
        response = httpx.get(
            source_url,
            timeout=20,
            headers={"User-Agent": "HitTrack local ranking importer"},
            follow_redirects=True,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise RankingImportError(f"Falha ao consultar {source_url}: {error}") from error
    return parse_ranking_html(response.text, category)


def save_ranking_snapshot(
    category: str,
    entries: list[dict[str, object]],
    db: Session,
) -> RankingSnapshot:
    if category not in RANKING_CATEGORIES:
        raise RankingImportError(f"Categoria de ranking não suportada: {category}")
    if not entries:
        raise RankingImportError(f"Snapshot vazio recusado para {category}.")

    snapshot = RankingSnapshot(
        category=category,
        source_url=f"{RANKING_BASE_URL}/{category}",
        imported_at=_utcnow_naive(),
        entries=[RankingEntry(**entry) for entry in entries],
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def import_ranking(category: str, db: Session) -> RankingSnapshot:
    entries = fetch_ranking(category)
    return save_ranking_snapshot(category, entries, db)


def latest_ranking(category: str, db: Session) -> RankingSnapshot | None:
    return db.scalar(
        select(RankingSnapshot)
        .options(selectinload(RankingSnapshot.entries))
        .where(RankingSnapshot.category == category)
        .order_by(RankingSnapshot.imported_at.desc(), RankingSnapshot.id.desc())
        .limit(1)
    )


def refresh_all_rankings() -> None:
    last_request_at = None
    for category in RANKING_CATEGORIES:
        try:
            with SessionLocal() as db:
                latest = latest_ranking(category, db)
            if latest and (
                _utcnow_naive() - latest.imported_at
            ).total_seconds() < REFRESH_INTERVAL_SECONDS:
                continue
            if last_request_at is not None:
                elapsed = time.monotonic() - last_request_at
                time.sleep(max(REQUEST_INTERVAL_SECONDS - elapsed, 0))
            last_request_at = time.monotonic()
            entries = fetch_ranking(category)
            with SessionLocal() as db:
                save_ranking_snapshot(category, entries, db)
        except RankingImportError:
            logging.getLogger(__name__).exception(
                "Falha ao atualizar ranking RoboCore da categoria %s", category
            )


def _daily_refresh_loop() -> None:
    logger = logging.getLogger(__name__)
    while True:
        try:
            refresh_all_rankings()
        except Exception:
            logger.exception("Falha inesperada na atualização diária dos rankings RoboCore")
        time.sleep(SCHEDULER_CHECK_INTERVAL_SECONDS)


def start_daily_refresh() -> None:
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            return
        _scheduler_started = True

    scheduler = threading.Thread(
        target=_daily_refresh_loop,
        name="robocore-ranking-refresh",
        daemon=True,
    )
    scheduler.start()
