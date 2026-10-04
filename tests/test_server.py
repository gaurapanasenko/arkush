"""Tests for FastAPI endpoints."""

import io

import cv2
import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from arkush.server import app

client = TestClient(app)


def _make_test_png() -> bytes:
    img = np.full((300, 400, 3), 100, np.uint8)
    cv2.rectangle(img, (60, 40), (340, 260), (220, 220, 220), -1)
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def _detect():
    res = client.post("/detect", files={"file": ("doc.png", _make_test_png(), "image/png")})
    assert res.status_code == 200
    return res.json()


def test_index():
    res = client.get("/")
    assert res.status_code == 200
    assert "arkush" in res.text


def test_detect_returns_corners_and_image():
    data = _detect()
    assert "image_id" in data
    assert len(data["corners"]) == 4
    assert data["width"] > 0
    assert data["height"] > 0


def test_process_with_filter_stack():
    det = _detect()
    body = {
        "image_id": det["image_id"],
        "corners": det["corners"],
        "format": "a4",
        "preview_mode": "fast",
        "filters": [
            {"type": "divide_bg", "blur": "gaussian", "radius": 10},
            {"type": "quantize", "colors": 8},
            {"type": "grayscale"},
        ],
    }
    res = client.post("/process", json=body)
    assert res.status_code == 200
    assert "image" in res.json()


def test_export_png_indexed():
    det = _detect()
    body = {
        "image_id": det["image_id"],
        "corners": det["corners"],
        "format": "a4",
        "preview_mode": "none",
        "filters": [{"type": "auto_levels"}],
        "file_format": "png",
        "png_mode": "indexed",
        "png_compress": 5,
        "png_colors": 16,
    }
    res = client.post("/export", json=body)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    pil = Image.open(io.BytesIO(res.content))
    assert pil.mode == "P"
    assert abs(pil.info["dpi"][0] - 300) < 0.01


def test_export_jpeg():
    det = _detect()
    body = {
        "image_id": det["image_id"],
        "corners": det["corners"],
        "format": "none",
        "preview_mode": "none",
        "filters": [],
        "file_format": "jpeg",
        "jpeg_quality": 90,
    }
    res = client.post("/export", json=body)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert res.content[:2] == b"\xff\xd8"


def test_process_unknown_image():
    res = client.post(
        "/process",
        json={
            "image_id": "missing",
            "corners": [[0, 0], [1, 0], [1, 1], [0, 1]],
            "filters": [],
        },
    )
    assert res.status_code == 404


def test_full_preview_larger_than_fast():
    det = _detect()
    body = {
        "image_id": det["image_id"],
        "corners": det["corners"],
        "format": "a4",
        "filters": [],
    }
    fast = client.post("/process", json={**body, "preview_mode": "fast"})
    full = client.post("/process", json={**body, "preview_mode": "full"})
    assert fast.status_code == 200 and full.status_code == 200
    fast_img = Image.open(io.BytesIO(__import__("base64").b64decode(fast.json()["image"])))
    full_img = Image.open(io.BytesIO(__import__("base64").b64decode(full.json()["image"])))
    assert full_img.width * full_img.height >= fast_img.width * fast_img.height


def test_export_uses_processed_cache():
    det = _detect()
    body = {
        "image_id": det["image_id"],
        "corners": det["corners"],
        "format": "a4",
        "preview_mode": "fast",
        "filters": [{"type": "grayscale"}],
    }
    proc = client.post("/process", json=body)
    assert proc.status_code == 200
    assert proc.json()["cached"] is False

    proc2 = client.post("/process", json=body)
    assert proc2.json()["cached"] is True

    export = client.post(
        "/export",
        json={
            **body,
            "preview_mode": "none",
            "file_format": "png",
            "png_mode": "rgb",
        },
    )
    assert export.status_code == 200


def test_export_invalid_filter_radius():
    det = _detect()
    res = client.post(
        "/export",
        json={
            "image_id": det["image_id"],
            "corners": det["corners"],
            "filters": [{"type": "divide_bg", "radius": 999}],
        },
    )
    assert res.status_code == 422
