# arkush

Web app for scanning documents from photos. Detects document corners, lets you adjust them manually, applies optional image corrections, and exports a print-ready PNG at 300 DPI.

All processing runs **entirely in the browser** via OpenCV.js — no server required. Your images never leave your device.

> This project was built with [vibe coding](https://en.wikipedia.org/wiki/Vibe_coding) — AI-assisted development in Cursor.

## Features

- **Corner detection** — OpenCV finds the four corners of the largest quadrilateral in the image
- **Manual adjustment** — drag corners on the source image; magnifier appears while dragging for pixel-precise placement
- **Perspective correction** — warp to a flat rectangle
- **Page formats** — A4 (210 × 297 mm) or Letter (8.5 × 11 in), or no fixed crop
- **Filter stack** — Auto Levels, Remove Background, Grayscale, Quantize Colors; drag to reorder
- **Remove Background** — Gaussian or Median blur + divide blend; kernel radius 1–450 (default 30)
- **Export** — PNG (RGB / Grayscale / Indexed) or JPEG (quality 1–100), 300 DPI
- **Preview modes** — no preview, fast (downscaled), or full (full resolution in browser)

## Run locally

Open [`src/arkush/static/index.html`](src/arkush/static/index.html) in a browser, or serve the static folder:

```bash
npm run serve
# open http://localhost:8000
```

For `file://` access, OpenCV.js is bundled locally under `static/opencv/`.

## Usage

1. Drop or upload a photo of a document.
2. Drag the blue corner handles if the auto-detection is off.
3. Choose format and add filters in the right panel (drag ⠿ to reorder).
4. Click **Apply**, or enable **Live Preview** for automatic updates.
5. Click **Download** to save the result at 300 DPI.

## Export sizes

| Format | Pixels at 300 DPI | Physical size   |
|--------|-------------------|-----------------|
| A4     | 2480 × 3508       | 210 × 297 mm    |
| Letter | 2550 × 3300       | 8.5 × 11 in     |
| No crop| varies            | derived from px |

## Project layout

```
src/arkush/static/
  index.html          # Web UI
  opencv/opencv.js    # OpenCV.js (WASM)
  js/
    main.js           # UI logic
    worker.js         # Web Worker (all image processing)
    detect.js         # Corner detection
    process.js        # Warp, filters
    encode.js         # PNG/JPEG export with DPI metadata
```

## Development

```bash
npm install
npm test
```

## Deploy

Host `src/arkush/static/` on any static file host (GitHub Pages, Netlify, etc.). Include `.nojekyll` for GitHub Pages.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
