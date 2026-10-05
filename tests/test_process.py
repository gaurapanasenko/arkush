"""Tests for image processing pipeline."""

import io

import cv2
import numpy as np
import pytest
from PIL import Image

from arkush.process import (
    DPI,
    ProcessingCancelled,
    apply_filter,
    auto_levels,
    blur_img,
    detect_auto_levels,
    divide_bg,
    downscale_for_preview,
    edge_pad,
    encode_image,
    format_size,
    process,
    quantize,
    to_grayscale,
    unsharp,
)


@pytest.fixture
def sample_bgr():
    img = np.zeros((80, 80, 3), np.uint8)
    img[20:60, 20:60] = 200
    return img


@pytest.fixture
def sample_corners():
    return np.array([[20, 20], [60, 20], [60, 60], [20, 60]], dtype=np.float32)


def test_edge_pad_replicates_border():
    img = np.zeros((10, 10, 3), np.uint8)
    img[:, :5] = 100
    img[:, 5:] = 200
    out = edge_pad(img, 2)
    assert out.shape == (14, 14, 3)
    assert out[0, 0, 0] == 100
    assert out[0, -1, 0] == 200
    assert out[-1, 0, 0] == 100
    assert out[1, 1, 0] == 100
    assert out[1, -2, 0] == 200


def test_edge_pad_corner_pixels():
    img = np.zeros((10, 10, 3), np.uint8)
    img[0, 0] = [1, 2, 3]
    img[0, -1] = [4, 5, 6]
    img[-1, 0] = [7, 8, 9]
    img[-1, -1] = [10, 11, 12]
    out = edge_pad(img, 3)
    assert (out[0, 0] == [1, 2, 3]).all()
    assert (out[0, -1] == [4, 5, 6]).all()
    assert (out[-1, 0] == [7, 8, 9]).all()
    assert (out[-1, -1] == [10, 11, 12]).all()


def test_auto_levels_stretches_value_range(sample_bgr):
    dark = sample_bgr // 4
    out = auto_levels(dark, low=0, high=50)
    assert out.max() > dark.max()


def test_auto_levels_input_range_by_value():
    img = np.arange(256, dtype=np.uint8).reshape(1, 256, 1)
    img = np.repeat(img, 3, axis=2)
    out = auto_levels(img, low=20, high=60)
    assert out.min() >= 0 and out.max() <= 255
    assert out[0, 19, 0] == 0
    assert out[0, 60, 0] == 255
    assert out[0, 0, 0] == 0
    assert out[0, 255, 0] == 255


def test_fast_gaussian_matches_legacy_small_radius():
    from arkush.process import _fast_gaussian, _gaussian_sigma

    img = np.random.randint(0, 256, (200, 200, 3), dtype=np.uint8).astype(np.float32)
    sigma = _gaussian_sigma(10)
    legacy = cv2.GaussianBlur(img, (21, 21), 0)
    fast = _fast_gaussian(img, sigma)
    assert np.mean(np.abs(legacy - fast)) < 2.0


def test_fast_gaussian_downscales_in_one_step():
    from arkush.process import _fast_gaussian, _gaussian_sigma

    img = np.random.randint(0, 256, (2000, 1500, 3), dtype=np.uint8).astype(np.float32)
    sigma = _gaussian_sigma(200)
    out = _fast_gaussian(img, sigma)
    assert out.shape == img.shape


def test_divide_bg_radius_bounds():
    img = np.full((100, 100, 3), 128, np.uint8)
    out = divide_bg(img, blur="gaussian", radius=1)
    assert out.shape == img.shape
    out2 = divide_bg(img, blur="median", radius=450)
    assert out2.shape == img.shape


def test_divide_bg_gain():
    img = np.full((50, 50, 3), 100, np.uint8)
    low = divide_bg(img, gain=1).mean()
    high = divide_bg(img, gain=255).mean()
    assert high > low


def test_blur_filter_smooths():
    img = np.zeros((50, 50, 3), np.uint8)
    img[20:30, 20:30] = 255
    out = blur_img(img, radius=5)
    assert out.shape == img.shape
    assert out[25, 15].mean() > 0


def test_unsharp_changes_image(sample_bgr):
    out = unsharp(sample_bgr, radius=2, amount=150)
    assert out.shape == sample_bgr.shape
    assert not np.array_equal(out, sample_bgr)


def test_detect_auto_levels_on_gradient():
    img = np.tile(np.arange(256, dtype=np.uint8), (10, 1))
    img = np.stack([img] * 3, axis=-1)
    low, high = detect_auto_levels(img)
    assert low < high
    assert low >= 0 and high <= 255


def test_grayscale_keeps_shape(sample_bgr):
    out = to_grayscale(sample_bgr)
    assert out.shape == sample_bgr.shape
    assert np.std(out[:, :, 0] - out[:, :, 1]) < 1


def test_quantize_reduces_unique_colors(sample_bgr):
    noisy = sample_bgr.astype(np.int16)
    noisy += np.random.randint(-20, 20, noisy.shape)
    noisy = np.clip(noisy, 0, 255).astype(np.uint8)
    out = quantize(noisy, colors=4)
    unique = len(np.unique(out.reshape(-1, 3), axis=0))
    assert unique <= 16


def test_filter_stack_order(sample_bgr, sample_corners):
    filters = [
        {"type": "divide_bg", "blur": "median", "radius": 5},
        {"type": "grayscale"},
        {"type": "auto_levels"},
    ]
    out = process(sample_bgr, sample_corners, "none", filters)
    assert out.shape[0] > 0 and out.shape[1] > 0


def test_process_preview_downscales(sample_bgr):
    big = cv2.resize(sample_bgr, (2000, 2000))
    corners = np.array([[0, 0], [1999, 0], [1999, 1999], [0, 1999]], dtype=np.float32)
    full = process(big, corners, "none", [])
    out = downscale_for_preview(full)
    assert max(out.shape[:2]) <= 1200


def test_process_cancellation(sample_bgr, sample_corners):
    with pytest.raises(ProcessingCancelled):
        process(sample_bgr, sample_corners, "none", [{"type": "auto_levels"}], cancelled=lambda: True)


def test_apply_filter_unknown(sample_bgr):
    assert apply_filter(sample_bgr, {"type": "nope"}).shape == sample_bgr.shape


def test_encode_png_rgb_grayscale_indexed(sample_bgr):
    for mode in ("rgb", "grayscale", "indexed"):
        data, mt, name = encode_image(
            sample_bgr, "a4", file_format="png", png_mode=mode, png_colors=8, png_compress=3
        )
        assert mt == "image/png"
        assert name == "scan.png"
        pil = Image.open(io.BytesIO(data))
        if mode == "grayscale":
            assert pil.mode == "L"
        elif mode == "indexed":
            assert pil.mode == "P"
        else:
            assert pil.mode == "RGB"
        assert abs(pil.info["dpi"][0] - 300) < 0.01


def test_format_size_custom_mm_and_in():
    assert format_size("custom", 210, 297, "mm") == (int(210 / 25.4 * DPI), int(297 / 25.4 * DPI))
    assert format_size("custom", 8.5, 11, "in") == (int(8.5 * DPI), int(11 * DPI))
    assert format_size("none") is None


def test_process_custom_format(sample_bgr, sample_corners):
    out = process(sample_bgr, sample_corners, "custom", [], custom_width=100, custom_height=50, custom_unit="mm")
    assert out.shape[:2] == (int(50 / 25.4 * DPI), int(100 / 25.4 * DPI))


def test_encode_jpeg(sample_bgr):
    data, mt, name = encode_image(sample_bgr, "none", file_format="jpeg", jpeg_quality=75)
    assert mt == "image/jpeg"
    assert name == "scan.jpg"
    pil = Image.open(io.BytesIO(data))
    assert pil.format == "JPEG"
