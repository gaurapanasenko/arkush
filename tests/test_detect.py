"""Tests for corner detection."""

import cv2
import numpy as np

from doc_detect.detect import _order_corners, find_corners


def test_order_corners():
    pts = np.array([[100, 0], [100, 200], [0, 200], [0, 0]], dtype=np.float32)
    ordered = _order_corners(pts)
    assert np.allclose(ordered[0], [0, 0])
    assert np.allclose(ordered[1], [100, 0])
    assert np.allclose(ordered[2], [100, 200])
    assert np.allclose(ordered[3], [0, 200])


def test_find_corners_on_white_rectangle():
    img = np.full((400, 600, 3), 80, np.uint8)
    cv2.rectangle(img, (80, 60), (520, 340), (230, 230, 230), -1)
    corners, scale = find_corners(img)
    assert scale == 1.0
    assert corners.shape == (4, 2)
    assert corners[0][0] < corners[1][0]  # tl left of tr
    assert corners[0][1] < corners[3][1]  # tl above bl


def test_find_corners_fallback_on_blank():
    img = np.zeros((100, 100, 3), np.uint8)
    corners, _ = find_corners(img)
    assert np.allclose(corners[0], [0, 0])
    assert np.allclose(corners[2], [99, 99])
