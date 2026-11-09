import json

import pytest

import routers.fights as fights_router


def create_fight(client, **overrides):
    payload = {
        "competition": "Copa Regional",
        "robot_red": "Robo A",
        "robot_green": "Robo B",
        "team_red": "Equipe A",
        "team_green": "Equipe B",
        "category": "antweight",
        "duration_seconds": 60,
        "fps": 30,
        "robot_aliases": {"vermelho": "Robo A", "azul": "Robo B"},
        **overrides,
    }
    return client.post("/api/fights", json=payload)


def test_fight_lifecycle_and_metrics(api_client):
    response = create_fight(api_client, competition="Copa Regional", team_red="Equipe A", category="antweight")
    assert response.status_code == 201
    fight = response.json()

    imported = api_client.post(
        f"/api/fights/{fight['id']}/hits",
        json={"events": [{"frame": 0, "robot": "vermelho"}, {"frame": 900, "robot": "azul"}]},
    )
    assert imported.status_code == 201
    assert len(imported.json()) == 2

    metrics = api_client.get(f"/api/fights/{fight['id']}/metrics").json()
    assert metrics["total_hits"] == 2
    assert metrics["robots"][0]["third_distribution"] == [1, 0, 0]
    assert metrics["robots"][1]["third_distribution"] == [0, 1, 0]

    listed = api_client.get("/api/fights")
    assert listed.status_code == 200
    assert listed.json()[0]["total_hits"] == 2
    assert listed.json()[0]["competition"] == "Copa Regional"
    assert listed.json()[0]["created_at"]
    assert listed.json()[0]["fought_at"] is None
    assert api_client.get(f"/api/fights/{fight['id']}").json()["robot_red"] == "Robo A"


def test_fight_creation_requires_competition_category_and_both_teams(api_client):
    payload = {
        "robot_red": "Robo A",
        "robot_green": "Robo B",
        "duration_seconds": 60,
        "fps": 30,
    }

    response = api_client.post("/api/fights", json=payload)

    assert response.status_code == 422


def test_fight_creation_rejects_invalid_winner(api_client):
    response = create_fight(api_client, winner_robot="Robo inexistente")

    assert response.status_code == 422


def test_closed_fight_can_record_winner(api_client):
    fight = create_fight(api_client, status="encerrada").json()

    response = api_client.patch(
        f"/api/fights/{fight['id']}/result",
        json={"winner_robot": "Robo B"},
    )

    assert response.status_code == 200
    assert response.json()["winner_robot"] == "Robo B"
    assert response.json()["result"] == "vitoria"


def test_fight_result_rejects_non_competitor_and_active_fight(api_client):
    closed_fight = create_fight(api_client, status="encerrada").json()
    active_fight = create_fight(api_client).json()

    invalid_winner = api_client.patch(
        f"/api/fights/{closed_fight['id']}/result",
        json={"winner_robot": "Outro robô"},
    )
    active_result = api_client.patch(
        f"/api/fights/{active_fight['id']}/result",
        json={"winner_robot": "Robo A"},
    )

    assert invalid_winner.status_code == 422
    assert active_result.status_code == 409


def test_fight_elo_can_be_recorded_for_existing_fight(api_client):
    fight = create_fight(api_client).json()

    response = api_client.patch(
        f"/api/fights/{fight['id']}/elo",
        json={"elo_red": 1240, "elo_green": 1110},
    )

    assert response.status_code == 200
    assert response.json()["elo_red"] == 1240
    assert response.json()["elo_green"] == 1110


def test_closed_fight_can_record_elo(api_client):
    fight = create_fight(api_client, status="encerrada").json()

    response = api_client.patch(
        f"/api/fights/{fight['id']}/elo",
        json={"elo_red": 1240, "elo_green": 1110},
    )

    assert response.status_code == 200
    assert response.json()["elo_red"] == 1240
    assert response.json()["elo_green"] == 1110


def test_fight_history_includes_video_filename(api_client, monkeypatch, tmp_path):
    video_path = tmp_path / "fight.mp4"
    video_path.write_bytes(b"video")
    fight = create_fight(api_client).json()
    monkeypatch.setattr(fights_router, "UPLOADS_DIR", tmp_path)

    with video_path.open("rb") as video:
        upload = api_client.post(
            f"/api/fights/{fight['id']}/video",
            files={"file": ("fight.mp4", video, "video/mp4")},
        )

    assert upload.status_code == 200
    video_response = api_client.get(f"/api/fights/{fight['id']}/video")
    assert video_response.status_code == 200
    assert video_response.content == b"video"
    history = api_client.get("/api/fights")
    assert history.status_code == 200
    assert history.json()[0]["video_filename"] == "fight.mp4"


def test_hit_import_rejects_unregistered_robot(api_client):
    fight = create_fight(api_client).json()

    response = api_client.post(
        f"/api/fights/{fight['id']}/hits",
        json={"events": [{"frame": 0, "robot": "intruso"}]},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["invalid_robots"] == ["intruso"]


def test_hit_import_is_idempotent_for_duplicate_events(api_client):
    fight = create_fight(api_client).json()
    path = f"/api/fights/{fight['id']}/hits"
    payload = {
        "events": [
            {"frame": 30, "robot": "Robo A"},
            {"frame": 30, "robot": "Robo A"},
            {"frame": 60, "robot": "Robo B"},
        ]
    }

    first_import = api_client.post(path, json=payload)
    repeated_import = api_client.post(path, json=payload)

    assert first_import.status_code == 201
    assert len(first_import.json()) == 2
    assert repeated_import.status_code == 201
    assert repeated_import.json() == []
    assert api_client.get(f"/api/fights/{fight['id']}/metrics").json()["total_hits"] == 2


def test_upload_hits_accepts_json_and_rejects_invalid_json(api_client):
    fight = create_fight(api_client).json()
    path = f"/api/fights/{fight['id']}/hits/upload"

    response = api_client.post(
        path,
        files={"file": ("hits.json", b'[{"frame": 2, "robot": "Robo A"}]', "application/json")},
    )
    assert response.status_code == 201
    assert response.json()[0]["frame"] == 2

    invalid = api_client.post(
        path,
        files={"file": ("hits.json", b"\xff", "application/json")},
    )
    assert invalid.status_code == 422


def test_upload_and_download_video_sanitizes_filename(api_client, tmp_path, monkeypatch):
    monkeypatch.setattr(fights_router, "UPLOADS_DIR", tmp_path)
    fight = create_fight(api_client).json()

    response = api_client.post(
        f"/api/fights/{fight['id']}/video",
        files={"file": ("../video luta.mp4", b"video-data", "video/mp4")},
    )

    assert response.status_code == 200
    uploaded = response.json()
    assert "/" not in uploaded["video_filename"]
    assert "\\" not in uploaded["video_filename"]
    assert list(tmp_path.iterdir())[0].read_bytes() == b"video-data"

    downloaded = api_client.get(f"/api/fights/{fight['id']}/video")
    assert downloaded.status_code == 200
    assert downloaded.content == b"video-data"


@pytest.mark.parametrize(
    "filename, content_type",
    [("video.txt", "video/mp4"), ("video.mp4", "application/octet-stream")],
)
def test_upload_video_rejects_unsupported_type_or_extension(
    api_client, filename, content_type
):
    fight = create_fight(api_client).json()

    response = api_client.post(
        f"/api/fights/{fight['id']}/video",
        files={"file": (filename, b"not a video", content_type)},
    )

    assert response.status_code == 415


def test_video_and_fight_not_found_responses(api_client):
    assert api_client.get("/api/fights/404").status_code == 404
    assert api_client.post(
        "/api/fights/404/hits",
        json={"events": [{"frame": 0, "robot": "Robo A"}]},
    ).status_code == 404
    assert api_client.get("/api/fights/404/video").status_code == 404

    fight = create_fight(api_client).json()
    assert api_client.get(f"/api/fights/{fight['id']}/video").status_code == 404


def test_video_download_rejects_missing_file(api_client, tmp_path):
    fight = create_fight(api_client, video_source=str(tmp_path / "missing.mp4")).json()

    response = api_client.get(f"/api/fights/{fight['id']}/video")

    assert response.status_code == 404


def test_video_download_uses_generic_type_for_unknown_extension(api_client, tmp_path):
    video_path = tmp_path / "fight.bin"
    video_path.write_bytes(b"video-data")
    fight = create_fight(
        api_client,
        video_source=str(video_path),
        video_filename="fight.bin",
    ).json()

    response = api_client.get(f"/api/fights/{fight['id']}/video")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"


@pytest.mark.parametrize(
    "filename, content_type, expected_type",
    [
        ("fight.avi", "video/x-msvideo", "video/x-msvideo"),
        ("fight.mov", "video/quicktime", "video/quicktime"),
        ("fight.webm", "video/webm", "video/webm"),
    ],
)
def test_video_upload_and_download_support_all_allowed_formats(
    api_client, tmp_path, monkeypatch, filename, content_type, expected_type
):
    monkeypatch.setattr(fights_router, "UPLOADS_DIR", tmp_path)
    fight = create_fight(api_client).json()

    uploaded = api_client.post(
        f"/api/fights/{fight['id']}/video",
        files={"file": (filename, b"video-data", content_type)},
    )
    assert uploaded.status_code == 200

    downloaded = api_client.get(f"/api/fights/{fight['id']}/video")

    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == expected_type


def test_hit_import_accepts_alias_keys_and_values(api_client):
    fight = create_fight(api_client).json()

    response = api_client.post(
        f"/api/fights/{fight['id']}/hits",
        json={
            "events": [
                {"frame": 0, "robot": "vermelho"},
                {"frame": 1, "robot": "Robo B"},
            ]
        },
    )

    assert response.status_code == 201
    assert [event["robot"] for event in response.json()] == ["vermelho", "Robo B"]


def test_upload_hits_rejects_malformed_json(api_client):
    fight = create_fight(api_client).json()

    response = api_client.post(
        f"/api/fights/{fight['id']}/hits/upload",
        files={"file": ("hits.json", json.dumps({"wrong": "shape"}).encode(), "application/json")},
    )

    assert response.status_code == 422
