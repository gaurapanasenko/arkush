"""Perspective warp, filters, and print-ready export."""

import io
from collections.abc import Callable
from typing import Any, Literal

import cv2
import numpy as np
from PIL import Image, PngImagePlugin

DPI = 300
EPS = 0.001

FORMATS = {
    "a4": (int(210 / 25.4 * DPI), int(297 / 25.4 * DPI)),
    "letter": (int(8.5 * DPI), int(11 * DPI)),
}


class ProcessingCancelled(Exception):
    pass


def auto_levels(img: np.ndarray, low: int = 0, high: int = 255) -> np.ndarray:
    low = max(0, min(254, low))
    high = max(low + 1, min(255, high))
    span = float(high - low)
    out = img.astype(np.float32)
    for c in range(3):
        stretched = (out[:, :, c] - low) / span * 255.0
        out[:, :, c] = np.clip(stretched, 0.0, 255.0)
    return out.astype(np.uint8)


def _gaussian_sigma(radius: int) -> float:
    """Match OpenCV sigma implied by the old (k, k), 0 kernel sizing."""
    k = radius * 2 + 1
    return 0.3 * ((k - 1) * 0.5 - 1) + 0.8


def _fast_gaussian(img: np.ndarray, sigma: float, target_sigma: float = 20.0, min_dim: int = 400) -> np.ndarray:
    """Separable Gaussian; one-shot downscale when sigma is large."""
    if sigma <= 0:
        return img
    oh, ow = img.shape[:2]
    if sigma <= target_sigma:
        return cv2.GaussianBlur(img, (0, 0), sigmaX=sigma, sigmaY=sigma)

    factor = sigma / target_sigma
    factor = min(factor, ow / min_dim, oh / min_dim)
    factor = max(factor, 1.0)

    if factor <= 1.0:
        return cv2.GaussianBlur(img, (0, 0), sigmaX=sigma, sigmaY=sigma)

    nw, nh = max(1, int(round(ow / factor))), max(1, int(round(oh / factor)))
    work = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    blurred = cv2.GaussianBlur(work, (0, 0), sigmaX=sigma / factor, sigmaY=sigma / factor)
    return cv2.resize(blurred, (ow, oh), interpolation=cv2.INTER_LINEAR)


def _blur(img: np.ndarray, blur: str, radius: int) -> np.ndarray:
    if blur == "median":
        k = max(3, min(radius * 2 + 1, 15) | 1)
        return cv2.medianBlur(img.astype(np.uint8), k).astype(np.float32)
    return _fast_gaussian(img, _gaussian_sigma(radius))


def divide_bg(
    img: np.ndarray,
    blur: str = "gaussian",
    radius: int = 30,
    gain: int = 255,
) -> np.ndarray:
    radius = max(1, min(450, radius))
    gain = max(1, min(255, gain))
    f = img.astype(np.float32)
    blurred = _blur(f, blur, radius)
    result = (f / np.maximum(blurred, EPS)) * gain
    return np.clip(result, 0, 255).astype(np.uint8)


def unsharp(img: np.ndarray, radius: int = 2, amount: int = 100) -> np.ndarray:
    radius = max(1, min(50, radius))
    amount_f = max(1, min(300, amount)) / 100.0
    blurred = cv2.GaussianBlur(img, (0, 0), sigmaX=radius)
    result = cv2.addWeighted(img.astype(np.float32), 1 + amount_f, blurred.astype(np.float32), -amount_f, 0)
    return np.clip(result, 0, 255).astype(np.uint8)


def to_grayscale(img: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def quantize(img: np.ndarray, colors: int = 16) -> np.ndarray:
    colors = max(2, min(256, colors))
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb).quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    back = np.array(pil.convert("RGB"))
    return cv2.cvtColor(back, cv2.COLOR_RGB2BGR)


def apply_filter(img: np.ndarray, filt: dict[str, Any]) -> np.ndarray:
    match filt["type"]:
        case "auto_levels":
            return auto_levels(img, filt.get("low", 0), filt.get("high", 255))
        case "divide_bg":
            return divide_bg(
                img,
                filt.get("blur", "gaussian"),
                filt.get("radius", 30),
                filt.get("gain", 255),
            )
        case "unsharp":
            return unsharp(img, filt.get("radius", 2), filt.get("amount", 100))
        case "grayscale":
            return to_grayscale(img)
        case "quantize":
            return quantize(img, filt.get("colors", 16))
        case _:
            return img


def warp(img: np.ndarray, corners: np.ndarray, out_size: tuple[int, int] | None) -> np.ndarray:
    corners = np.array(corners, dtype=np.float32).reshape(4, 2)
    if out_size is None:
        w1 = np.linalg.norm(corners[1] - corners[0])
        w2 = np.linalg.norm(corners[2] - corners[3])
        h1 = np.linalg.norm(corners[3] - corners[0])
        h2 = np.linalg.norm(corners[2] - corners[1])
        ow, oh = int(max(w1, w2)), int(max(h1, h2))
    else:
        ow, oh = out_size

    dst = np.array([[0, 0], [ow - 1, 0], [ow - 1, oh - 1], [0, oh - 1]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(corners, dst)
    return cv2.warpPerspective(img, m, (ow, oh))


def process(
    img: np.ndarray,
    corners: np.ndarray,
    fmt: str,
    filters: list[dict[str, Any]],
    cancelled: Callable[[], bool] | None = None,
) -> np.ndarray:
    if cancelled and cancelled():
        raise ProcessingCancelled()

    out_size = FORMATS.get(fmt)
    result = warp(img, corners, out_size)

    for filt in filters:
        if cancelled and cancelled():
            raise ProcessingCancelled()
        result = apply_filter(result, filt)

    return result


def downscale_for_preview(img: np.ndarray, max_dim: int = 1200) -> np.ndarray:
    if max(img.shape[:2]) <= max_dim:
        return img
    scale = max_dim / max(img.shape[:2])
    return cv2.resize(img, None, fx=scale, fy=scale)


def _png_metadata(page_fmt: str, img: np.ndarray) -> PngImagePlugin.PngInfo:
    if page_fmt in FORMATS:
        w_mm = 210 if page_fmt == "a4" else 215.9
        h_mm = 297 if page_fmt == "a4" else 279.4
    else:
        w_mm = img.shape[1] / DPI * 25.4
        h_mm = img.shape[0] / DPI * 25.4
    meta = PngImagePlugin.PngInfo()
    meta.add_text("dpi", str(DPI))
    meta.add_text("print_size_mm", f"{w_mm:.1f}x{h_mm:.1f}")
    return meta


def encode_image(
    img: np.ndarray,
    page_fmt: str,
    file_format: Literal["png", "jpeg"] = "jpeg",
    png_mode: Literal["rgb", "grayscale", "indexed"] = "rgb",
    png_compress: int = 9,
    png_colors: int = 256,
    jpeg_quality: int = 65,
) -> tuple[bytes, str, str]:
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)

    if file_format == "jpeg":
        buf = io.BytesIO()
        pil.save(buf, format="JPEG", quality=jpeg_quality, dpi=(DPI, DPI))
        return buf.getvalue(), "image/jpeg", "scan.jpg"

    if png_mode == "grayscale":
        pil = pil.convert("L")
    elif png_mode == "indexed":
        colors = max(2, min(256, png_colors))
        pil = pil.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)

    buf = io.BytesIO()
    pil.save(
        buf,
        format="PNG",
        dpi=(DPI, DPI),
        compress_level=max(0, min(9, png_compress)),
        pnginfo=_png_metadata(page_fmt, img),
    )
    return buf.getvalue(), "image/png", "scan.png"


# ponytail: alias kept for any external callers
def encode_png(img: np.ndarray, fmt: str) -> bytes:
    data, _, _ = encode_image(img, fmt)
    return data
