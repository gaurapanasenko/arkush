"""FastAPI server."""

import asyncio
import base64
import hashlib
import json
import uuid
from functools import partial
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from arkush.detect import corners_to_display, display_image, find_corners
from arkush.process import (
    FORMATS,
    ProcessingCancelled,
    apply_filter,
    detect_auto_levels,
    downscale_for_preview,
    edge_pad,
    encode_image,
    process,
    warp,
)

STATIC = Path(__file__).parent / "static"

# ponytail: in-memory per image_id — original + processed results for the session
_cache: dict[str, dict] = {}
_MAX_CACHED_RESULTS = 8

app = FastAPI(title="arkush")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


class Filter(BaseModel):
    type: Literal["auto_levels", "divide_bg", "unsharp", "grayscale", "quantize"]
    blur: Literal["gaussian", "median"] = "gaussian"
    radius: int = Field(default=30, ge=1, le=450)
    gain: int = Field(default=255, ge=1, le=255)
    amount: int = Field(default=100, ge=1, le=300)
    low: int = Field(default=0, ge=0, le=254)
    high: int = Field(default=255, ge=1, le=255)
    colors: int = Field(default=16, ge=2, le=256)


class ProcessRequest(BaseModel):
    image_id: str
    corners: list[list[float]]
    format: str = "a4"
    filters: list[Filter] = []
    preview_mode: Literal["none", "fast", "full"] = "fast"
    padding: int = Field(default=0, ge=0)


class DetectLevelsRequest(BaseModel):
    image_id: str
    corners: list[list[float]]
    format: str = "a4"
    filters: list[Filter] = []
    padding: int = Field(default=0, ge=0)


class ExportRequest(ProcessRequest):
    file_format: Literal["png", "jpeg"] = "jpeg"
    png_mode: Literal["rgb", "grayscale", "indexed"] = "rgb"
    png_compress: int = Field(default=9, ge=0, le=9)
    png_colors: int = Field(default=256, ge=2, le=256)
    jpeg_quality: int = Field(default=65, ge=1, le=100)


def _filter_dict(f: Filter) -> dict:
    match f.type:
        case "auto_levels":
            return {"type": "auto_levels", "low": f.low, "high": f.high}
        case "divide_bg":
            return {"type": "divide_bg", "blur": f.blur, "radius": f.radius, "gain": f.gain}
        case "unsharp":
            return {"type": "unsharp", "radius": f.radius, "amount": f.amount}
        case "grayscale":
            return {"type": "grayscale"}
        case "quantize":
            return {"type": "quantize", "colors": f.colors}
        case _:
            return {}


def _process_key(corners: np.ndarray, fmt: str, filters: list[dict], padding: int) -> str:
    payload = json.dumps({"c": corners.tolist(), "f": fmt, "filters": filters, "p": padding}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _store_processed(entry: dict, key: str, img: np.ndarray) -> None:
    processed = entry.setdefault("processed", {})
    processed[key] = img
    while len(processed) > _MAX_CACHED_RESULTS:
        del processed[next(iter(processed))]


def _b64_png(img: np.ndarray) -> str:
    _, buf = cv2.imencode(".png", img)
    return base64.b64encode(buf).decode()


def _decode_upload(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "Invalid image")
    return img


def _scaled_corners(entry: dict, corners: np.ndarray) -> np.ndarray:
    scale = entry["scale"]
    if scale < 1.0:
        return corners / scale
    return corners


def _max_padding(entry: dict) -> int:
    h, w = entry["original"].shape[:2]
    return int(min(w, h) * 0.5)


def _clamp_padding(entry: dict, padding: int) -> int:
    return max(0, min(int(padding), _max_padding(entry)))


async def _run_process(
    request: Request,
    original: np.ndarray,
    corners: np.ndarray,
    fmt: str,
    filters: list[dict],
    padding: int,
) -> np.ndarray:
    cancelled = {"v": False}

    async def _watch() -> None:
        while not cancelled["v"]:
            if await request.is_disconnected():
                cancelled["v"] = True
                return
            await asyncio.sleep(0.05)

    watch = asyncio.create_task(_watch())
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None,
            partial(
                process,
                original,
                corners,
                fmt,
                filters,
                padding,
                cancelled=lambda: cancelled["v"],
            ),
        )
    except ProcessingCancelled:
        raise HTTPException(499, "Cancelled") from None
    finally:
        watch.cancel()


async def _get_full_result(
    request: Request,
    entry: dict,
    corners: np.ndarray,
    fmt: str,
    filters: list[dict],
    padding: int,
) -> tuple[np.ndarray, bool]:
    key = _process_key(corners, fmt, filters, padding)
    cached = entry.get("processed", {}).get(key)
    if cached is not None:
        return cached, True
    result = await _run_process(request, entry["original"], corners, fmt, filters, padding)
    _store_processed(entry, key, result)
    return result, False


@app.get("/")
async def index():
    return Response((STATIC / "index.html").read_bytes(), media_type="text/html")


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    img = _decode_upload(await file.read())
    corners, scale = find_corners(img)
    disp = display_image(img, scale)
    image_id = str(uuid.uuid4())
    _cache[image_id] = {"original": img, "scale": scale, "processed": {}}
    return {
        "image_id": image_id,
        "corners": corners_to_display(corners, scale),
        "image": _b64_png(disp),
        "width": disp.shape[1],
        "height": disp.shape[0],
        "scale": scale,
    }


@app.post("/detect-levels")
async def detect_levels(req: DetectLevelsRequest):
    entry = _cache.get(req.image_id)
    if entry is None:
        raise HTTPException(404, "Image not found, re-upload")

    corners = _scaled_corners(entry, np.array(req.corners, dtype=np.float32))
    fmt = req.format if req.format in ("a4", "letter", "none") else "a4"
    padding = _clamp_padding(entry, req.padding)
    img = entry["original"]
    if padding > 0:
        img = edge_pad(img, padding)
        corners = corners + padding

    img = warp(img, corners, FORMATS.get(fmt))
    for filt in [_filter_dict(f) for f in req.filters]:
        img = apply_filter(img, filt)

    low, high = detect_auto_levels(img)
    return {"low": low, "high": high}


@app.post("/process")
async def process_image(req: ProcessRequest, request: Request):
    entry = _cache.get(req.image_id)
    if entry is None:
        raise HTTPException(404, "Image not found, re-upload")

    corners = _scaled_corners(entry, np.array(req.corners, dtype=np.float32))
    fmt = req.format if req.format in ("a4", "letter", "none") else "a4"
    filters = [_filter_dict(f) for f in req.filters]
    padding = _clamp_padding(entry, req.padding)

    full, from_cache = await _get_full_result(request, entry, corners, fmt, filters, padding)
    result = downscale_for_preview(full) if req.preview_mode == "fast" else full
    return {"image": _b64_png(result), "cached": from_cache}


@app.post("/export")
async def export_image(req: ExportRequest, request: Request):
    entry = _cache.get(req.image_id)
    if entry is None:
        raise HTTPException(404, "Image not found, re-upload")

    corners = _scaled_corners(entry, np.array(req.corners, dtype=np.float32))
    fmt = req.format if req.format in ("a4", "letter", "none") else "a4"
    filters = [_filter_dict(f) for f in req.filters]
    padding = _clamp_padding(entry, req.padding)

    result, _ = await _get_full_result(request, entry, corners, fmt, filters, padding)
    data, media_type, filename = encode_image(
        result,
        fmt,
        file_format=req.file_format,
        png_mode=req.png_mode,
        png_compress=req.png_compress,
        png_colors=req.png_colors,
        jpeg_quality=req.jpeg_quality,
    )
    return Response(
        data,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
