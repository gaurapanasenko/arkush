/** Web Worker: all OpenCV processing */
"use strict";

importScripts(
  "../opencv/opencv.js",
  "cv-helpers.js",
  "detect.js",
  "process.js",
  "png-encode.js",
  "encode.js",
  "cache.js",
);

let original = null;
let cancelledGen = -1;
const memBudget = Math.floor((self.navigator.deviceMemory || 4) * 1024 * 1024 * 1024 / 2);
const resultCache = createCache(memBudget);

function isCancelled(gen) {
  return gen !== undefined && gen === cancelledGen;
}

function storeOriginal(mat) {
  if (original) original.delete();
  original = mat;
  resultCache.clear();
}

function clampPadding(padding) {
  if (!original) return 0;
  const max = Math.floor(Math.min(original.cols, original.rows) * 0.5);
  return Math.max(0, Math.min(padding | 0, max));
}

async function loadPreview(corners, scale) {
  const disp = displayImage(original, scale);
  const preview = matToImageBitmap(disp);
  const width = disp.cols;
  const height = disp.rows;
  disp.delete();
  return { corners, scale, width, height, preview };
}

async function handleDetect(msg) {
  try {
    const mat = await bufferToMat(msg.buffer);
    const extra = matNbytes(mat);
    if (extra > memBudget) {
      mat.delete();
      self.postMessage({ type: "error", id: msg.id, message: "Image too large" });
      return;
    }
    storeOriginal(mat);
    const { corners, scale } = findCorners(original);
    const out = await loadPreview(corners, scale);
    self.postMessage(
      { type: "detected", id: msg.id, ...out },
      [out.preview],
    );
  } catch (e) {
    self.postMessage({ type: "error", id: msg.id, message: e.message || "Invalid image" });
  }
}

async function handleRestore(msg) {
  try {
    const mat = await bufferToMat(msg.buffer);
    const extra = matNbytes(mat);
    if (extra > memBudget) {
      mat.delete();
      self.postMessage({ type: "error", id: msg.id, message: "Image too large" });
      return;
    }
    storeOriginal(mat);
    const scale = msg.scale ?? 1;
    const corners = msg.corners;
    const out = await loadPreview(corners, scale);
    self.postMessage(
      { type: "restored", id: msg.id, ...out },
      [out.preview],
    );
  } catch (e) {
    self.postMessage({ type: "error", id: msg.id, message: e.message || "Invalid image" });
  }
}

async function handleProcess(msg) {
  if (!original) {
    self.postMessage({ type: "error", gen: msg.gen, message: "No image loaded" });
    return;
  }
  const gen = msg.gen;
  const p = msg.params;
  const padding = clampPadding(p.padding);
  const filters = p.filters || [];
  const key = await processKey({
    c: p.corners,
    f: p.format,
    filters,
    p: padding,
    cw: p.format === "custom" ? p.custom_width : null,
    ch: p.format === "custom" ? p.custom_height : null,
    cu: p.format === "custom" ? p.custom_unit : null,
  });

  let full = resultCache.get(key);
  let fromCache = !!full;
  if (!full) {
    if (isCancelled(gen)) {
      self.postMessage({ type: "cancelled", gen });
      return;
    }
    try {
      full = processImage(
        original,
        p.corners,
        p.format,
        filters,
        padding,
        () => isCancelled(gen),
        p.custom_width,
        p.custom_height,
        p.custom_unit,
      );
      resultCache.set(key, matClone(full));
    } catch (e) {
      if (e instanceof ProcessingCancelled) {
        self.postMessage({ type: "cancelled", gen });
        return;
      }
      console.error("[arkush:process]", "processImage failed", {
        gen,
        message: e?.message,
        stack: e?.stack,
        format: p.format,
        preview_mode: p.preview_mode,
        padding,
        filterCount: filters.length,
        filterTypes: filters.map(f => f.type),
      });
      self.postMessage({ type: "error", gen, message: e.message || "Processing failed" });
      return;
    }
  }

  if (isCancelled(gen)) {
    if (!fromCache) full.delete();
    self.postMessage({ type: "cancelled", gen });
    return;
  }

  let preview = full;
  let previewOwned = false;
  if (p.preview_mode === "fast") {
    preview = downscaleForPreview(full);
    previewOwned = true;
  }

  const bitmap = matToImageBitmap(preview);
  const width = preview.cols;
  const height = preview.rows;
  if (previewOwned) preview.delete();
  if (!fromCache) full.delete();

  self.postMessage(
    { type: "processed", gen, width, height, cached: fromCache, preview: bitmap },
    [bitmap],
  );
}

function handleDetectLevels(msg) {
  if (!original) {
    self.postMessage({ type: "error", id: msg.id, message: "No image loaded" });
    return;
  }
  const p = msg.params;
  const padding = clampPadding(p.padding);
  const [low, high] = detectLevelsPipeline(
    original,
    p.corners,
    p.format,
    p.filters || [],
    padding,
    p.custom_width,
    p.custom_height,
    p.custom_unit,
  );
  self.postMessage({ type: "levels", id: msg.id, low, high });
}

async function handleExport(msg) {
  if (!original) {
    self.postMessage({ type: "error", gen: msg.gen, message: "No image loaded" });
    return;
  }
  const gen = msg.gen;
  const p = msg.params;
  const padding = clampPadding(p.padding);
  const filters = p.filters || [];
  const key = await processKey({
    c: p.corners,
    f: p.format,
    filters,
    p: padding,
    cw: p.format === "custom" ? p.custom_width : null,
    ch: p.format === "custom" ? p.custom_height : null,
    cu: p.format === "custom" ? p.custom_unit : null,
  });

  let full = resultCache.get(key);
  if (!full) {
    if (isCancelled(gen)) {
      self.postMessage({ type: "cancelled", gen });
      return;
    }
    try {
      full = processImage(
        original,
        p.corners,
        p.format,
        filters,
        padding,
        () => isCancelled(gen),
        p.custom_width,
        p.custom_height,
        p.custom_unit,
      );
      resultCache.set(key, matClone(full));
    } catch (e) {
      if (e instanceof ProcessingCancelled) {
        self.postMessage({ type: "cancelled", gen });
        return;
      }
      self.postMessage({ type: "error", gen, message: e.message || "Export failed" });
      return;
    }
  } else {
    full = matClone(full);
  }

  if (isCancelled(gen)) {
    full.delete();
    self.postMessage({ type: "cancelled", gen });
    return;
  }

  const { bytes, mime } = await encodeImage(full, p.format, {
    file_format: p.file_format,
    png_mode: p.png_mode,
    png_colors: p.png_colors,
    jpeg_quality: p.jpeg_quality,
  });
  full.delete();

  self.postMessage({ type: "exported", gen, buffer: bytes.buffer, mime }, [bytes.buffer]);
}

function onMessage(msg) {
  switch (msg.type) {
    case "detect":
      handleDetect(msg).catch(e => {
        self.postMessage({ type: "error", id: msg.id, message: e.message || "Detection failed" });
      });
      break;
    case "restore":
      handleRestore(msg).catch(e => {
        self.postMessage({ type: "error", id: msg.id, message: e.message || "Restore failed" });
      });
      break;
    case "process":
      handleProcess(msg).catch(e => {
        console.error("[arkush:process]", "handleProcess uncaught", {
          gen: msg.gen,
          message: e?.message,
          stack: e?.stack,
        });
        self.postMessage({ type: "error", gen: msg.gen, message: e.message || "Processing failed" });
      });
      break;
    case "detectLevels":
      handleDetectLevels(msg);
      break;
    case "export":
      handleExport(msg).catch(e => {
        self.postMessage({ type: "error", gen: msg.gen, message: e.message || "Export failed" });
      });
      break;
    case "cancel":
      cancelledGen = msg.gen;
      break;
    case "clear":
      if (original) {
        original.delete();
        original = null;
      }
      resultCache.clear();
      break;
  }
}

cv["onRuntimeInitialized"] = () => {
  self.postMessage({ type: "ready" });
  self.onmessage = e => onMessage(e.data);
};
