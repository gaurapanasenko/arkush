# doc-detect

Web app for scanning documents from photos. Detects document corners, lets you adjust them manually, applies optional image corrections, and exports a print-ready PNG at 300 DPI.

> This project was built with [vibe coding](https://en.wikipedia.org/wiki/Vibe_coding) — AI-assisted development in Cursor.

## Features

- **Corner detection** — OpenCV finds the four corners of the largest quadrilateral in the image
- **Manual adjustment** — drag corners on the source image; magnifier appears while dragging for pixel-precise placement
- **Perspective correction** — warp to a flat rectangle
- **Page formats** — A4 (210 × 297 mm) or Letter (8.5 × 11 in), or no fixed crop
- **Filter stack** — Auto Levels, Remove Background, Grayscale, Quantize Colors; drag to reorder
- **Remove Background** — Gaussian or Median blur + divide blend; kernel radius 1–450 (default 30)
- **Export** — PNG (RGB / Grayscale / Indexed, compression 0–9) or JPEG (quality 1–100), 300 DPI
- **Preview modes** — no preview, fast (downscaled), or full (full resolution in browser)
- **Export** — PNG at 300 DPI with correct print metadata

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

## Install & run

```bash
git clone <repo-url>
cd doc-detect
uv sync
uv run doc-detect
uv run doc-detect --port 3000   # custom port
```

Open http://127.0.0.1:8000 in your browser (or whichever port you set).

With pip instead of uv:

```bash
pip install -e .
doc-detect
```

## Usage

1. Drop or upload a photo of a document.
2. Drag the blue corner handles if the auto-detection is off.
3. Choose format and add filters in the right panel (drag ⠿ to reorder).
4. Click **Apply**, or enable **Live Preview** for automatic updates.
5. Click **Download (300 DPI)** to save the result.

## Export sizes

| Format | Pixels at 300 DPI | Physical size   |
|--------|-------------------|-----------------|
| A4     | 2480 × 3508       | 210 × 297 mm    |
| Letter | 2550 × 3300       | 8.5 × 11 in     |
| No crop| varies            | derived from px |

## API

| Endpoint   | Method | Description                          |
|------------|--------|--------------------------------------|
| `/`        | GET    | Web UI                               |
| `/detect`  | POST   | Upload image, returns corners + preview |
| `/process` | POST   | Warp and apply filter stack, returns preview PNG |
| `/export`  | POST   | Full-resolution export (PNG/JPEG, 300 DPI) |

`POST /process` and `POST /export` body:

```json
{
  "image_id": "...",
  "corners": [[x,y], ...],
  "format": "a4",
  "preview_mode": "fast",
  "filters": [
    { "type": "divide_bg", "blur": "gaussian", "radius": 30 },
    { "type": "quantize", "colors": 16 },
    { "type": "grayscale" }
  ]
}
```

`POST /export` adds: `file_format` (`png`|`jpeg`), `png_mode` (`rgb`|`grayscale`|`indexed`), `png_compress` (0–9), `png_colors` (2–256), `jpeg_quality` (1–100).

## Project layout

```
src/doc_detect/
  detect.py      # corner detection
  process.py     # warp, filters, export
  server.py      # FastAPI routes
  static/
    index.html   # browser UI
```

## Development

```bash
uv sync --group dev
uv run pytest -v
```

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
