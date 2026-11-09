from contextlib import nullcontext
from datetime import UTC, datetime
from types import SimpleNamespace

from robo_core_rankings import RankingImportError, parse_ranking_html, save_ranking_snapshot


RANKING_HTML = """
<table id="rank-table">
  <tr><th>Rank</th><th>Score</th><th>Robot</th><th>TF</th><th>W/L</th><th>Latest Fight</th></tr>
  <tr>
    <td>1 <i>trophy</i></td><td>1450.250</td>
    <td><a href="/history/123">Robo Alpha</a><br><span title="BR"></span> Team Alpha</td>
    <td>20</td><td>14/6</td><td>2026-10-12 16:56:16</td>
  </tr>
</table>
"""


def test_parse_ranking_html_extracts_robo_core_fields():
    entries = parse_ranking_html(RANKING_HTML, "antweight")

    assert entries == [
        {
            "rank_position": 1,
            "elo_score": 1450.25,
            "robot_name": "Robo Alpha",
            "team_name": "Team Alpha",
            "robot_source_id": 123,
            "total_fights": 20,
            "wins": 14,
            "losses": 6,
            "latest_fight_at": datetime(2026, 10, 12, 16, 56, 16),
            "robot_url": "https://rank.robocore.net/history/123",
        }
    ]


def test_parse_ranking_html_rejects_empty_or_changed_pages():
    try:
        parse_ranking_html("<html><body>temporarily unavailable</body></html>", "antweight")
    except RankingImportError as error:
        assert "Nenhum registro" in str(error)
    else:
        raise AssertionError("Expected malformed ranking pages to fail explicitly")


def test_all_robo_core_combat_categories_are_supported():
    from robo_core_rankings import RANKING_CATEGORIES

    assert list(RANKING_CATEGORIES) == [
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
    ]
    for category in RANKING_CATEGORIES:
        assert parse_ranking_html(RANKING_HTML, category)


def test_ranking_endpoint_returns_saved_snapshot_and_refreshes(api_client, db_session, monkeypatch):
    import robo_core_rankings

    entry = parse_ranking_html(RANKING_HTML, "antweight")[0]
    saved = save_ranking_snapshot("antweight", [entry], db_session)
    response = api_client.get("/api/rankings?category=antweight")

    assert response.status_code == 200
    assert response.json()["imported_at"]
    assert response.json()["entries"][0]["robot_name"] == "Robo Alpha"

    monkeypatch.setattr(robo_core_rankings, "fetch_ranking", lambda category: [entry])
    refreshed = api_client.post("/api/rankings/refresh?category=antweight")

    assert refreshed.status_code == 200
    assert refreshed.json()["category"] == "antweight"
    assert refreshed.json()["entries"][0]["elo_score"] == 1450.25
    assert refreshed.json()["imported_at"] >= saved.imported_at.isoformat()


def test_ranking_refresh_reports_source_errors_without_losing_saved_snapshot(
    api_client, db_session, monkeypatch
):
    import robo_core_rankings

    entry = parse_ranking_html(RANKING_HTML, "antweight")[0]
    save_ranking_snapshot("antweight", [entry], db_session)

    def fail_fetch(category):
        raise RankingImportError("RoboCore indisponível")

    monkeypatch.setattr(robo_core_rankings, "fetch_ranking", fail_fetch)
    response = api_client.post("/api/rankings/refresh?category=antweight")

    assert response.status_code == 502
    assert response.json()["detail"] == "RoboCore indisponível"
    latest = api_client.get("/api/rankings?category=antweight")
    assert latest.status_code == 200
    assert latest.json()["entries"][0]["robot_name"] == "Robo Alpha"


def test_daily_refresh_skips_fresh_snapshots_and_imports_missing_categories(monkeypatch):
    import robo_core_rankings

    fetched = []
    saved = []
    monkeypatch.setattr(robo_core_rankings, "SessionLocal", lambda: nullcontext(object()))
    monkeypatch.setattr(
        robo_core_rankings,
        "latest_ranking",
        lambda category, db: (
            SimpleNamespace(imported_at=datetime.now(UTC).replace(tzinfo=None))
            if category == "fairyweight"
            else None
        ),
    )
    monkeypatch.setattr(
        robo_core_rankings,
        "fetch_ranking",
        lambda category: fetched.append(category) or [{"robot_name": "Robot"}],
    )
    monkeypatch.setattr(
        robo_core_rankings,
        "save_ranking_snapshot",
        lambda category, entries, db: saved.append(category),
    )
    monkeypatch.setattr(robo_core_rankings.time, "sleep", lambda seconds: None)

    robo_core_rankings.refresh_all_rankings()

    assert fetched == [
        category
        for category in robo_core_rankings.RANKING_CATEGORIES
        if category != "fairyweight"
    ]
    assert saved == fetched
