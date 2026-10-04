"""Document corner detection."""

import cv2
import numpy as np

MAX_DIM = 2000


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order points: top-left, top-right, bottom-right, bottom-left."""
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    ordered = np.zeros((4, 2), dtype=np.float32)
    ordered[0] = pts[np.argmin(s)]
    ordered[2] = pts[np.argmax(s)]
    ordered[1] = pts[np.argmin(d)]
    ordered[3] = pts[np.argmax(d)]
    return ordered


def _find_quad(contours: list) -> np.ndarray | None:
    for cnt in contours[:10]:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(approx) > 0:
            return _order_corners(approx.reshape(4, 2))
    return None


def find_corners(img: np.ndarray) -> tuple[np.ndarray, float]:
    """Return (4 corners in original-image coords, display scale factor)."""
    h, w = img.shape[:2]
    scale = min(1.0, MAX_DIM / max(h, w))
    work = cv2.resize(img, None, fx=scale, fy=scale) if scale < 1.0 else img

    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    corners = _find_quad(contours)
    if corners is None:
        wh, ww = work.shape[:2]
        corners = np.array([[0, 0], [ww - 1, 0], [ww - 1, wh - 1], [0, wh - 1]], dtype=np.float32)

    if scale < 1.0:
        corners = corners / scale
    return corners, scale


def display_image(img: np.ndarray, scale: float) -> np.ndarray:
    if scale < 1.0:
        return cv2.resize(img, None, fx=scale, fy=scale)
    return img


def corners_to_display(corners: np.ndarray, scale: float) -> list[list[float]]:
    pts = corners * scale if scale < 1.0 else corners
    return pts.tolist()
