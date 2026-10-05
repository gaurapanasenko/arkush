import {
  waitForReady,
  detectImage,
  processImage,
  detectLevels,
  exportImage,
  cancelWorker,
} from "./worker-client.js";
import {
  fromDisplayCorner as origFromDisplay,
  paddingInOriginal,
  toDisplayCorner,
} from "./pure/coords.js";

const $ = id => document.getElementById(id);
const sourceCanvas = $("source-canvas");
const resultCanvas = $("result-canvas");
const sCtx = sourceCanvas.getContext("2d");
const rCtx = resultCanvas.getContext("2d");
const magCanvas = $("mag-canvas");
const magCtx = magCanvas.getContext("2d");
const magnifier = $("magnifier");

let imageLoaded = false;
let sourceBitmap = null;
let displayScale = 1;
let edgePadding = 0;
let corners = [];
let dragging = -1;
let currentStep = 1;

const HANDLE_R = 16;
const LINE_W = 4;
const MAG_SIZE = 280;
const MAG_ZOOM_MIN = 2;
const MAG_ZOOM_MAX = 16;
const MAG_OFFSET = 28;

let magEnabled = false;
let activeCorner = -1;
let magZoom = 4;
let magPos = { clientX: 0, clientY: 0, cx: 0, cy: 0 };

let resultImg = null;
let viewZoom = 1;
let viewPanX = 0;
let viewPanY = 0;
let viewPanning = false;
let viewPanStart = null;
const VIEW_ZOOM_MIN = 1;
const VIEW_ZOOM_MAX = 20;

function toDisplayCorners() {
  return corners.map(([x, y]) => toDisplayCorner(x, y, displayScale, edgePadding));
}

function setStep(n) {
  disableMag();
  currentStep = n;
  for (let i = 1; i <= 3; i++) {
    $("step-" + i).classList.toggle("active", i === n);
    const ind = $("ind-" + i);
    ind.classList.toggle("active", i === n);
    ind.classList.toggle("done", i < n);
  }
}

const dropZone = $("drop-zone");
const fileInput = $("file-input");
const loadingOverlay = $("loading-overlay");

waitForReady().then(() => {
  loadingOverlay.classList.add("hidden");
  dropZone.classList.remove("disabled");
});

dropZone.addEventListener("click", () => { if (!dropZone.classList.contains("disabled")) fileInput.click(); });
dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", e => {
  e.preventDefault(); dropZone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => { if (fileInput.files[0]) upload(fileInput.files[0]); });

function basenameFromFile(file) {
  const name = file.name || "scan";
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).replace(/[\\/:*?"<>|]/g, "_");
}

function downloadFilename() {
  const base = $("export-filename").value.trim() || "scan";
  const ext = $("export-format").value === "jpeg" ? ".jpg" : ".png";
  return base.replace(/[\\/:*?"<>|]/g, "_") + ext;
}

async function upload(file) {
  cancelOperation();
  dropZone.classList.add("loading");
  $("export-filename").value = basenameFromFile(file);
  $("export-filename").disabled = false;
  uploadAbort = new AbortController();
  updateCancelBtn();
  try {
    await waitForReady();
    if (uploadAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const buffer = await file.arrayBuffer();
    if (uploadAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const data = await detectImage(buffer, uploadAbort.signal);
    if (sourceBitmap) sourceBitmap.close();
    imageLoaded = true;
    displayScale = data.scale ?? 1;
    edgePadding = 0;
    $("edge-pad").value = 0;
    $("edge-pad-val").textContent = "0";
    corners = data.corners;
    sourceBitmap = data.preview;
    $("edge-pad").max = maxEdgePadding();
    drawSource();
    setStep(2);
  } catch (e) {
    if (e.name !== "AbortError") alert("Detection failed. Try another image.");
  } finally {
    uploadAbort = null;
    updateCancelBtn();
    dropZone.classList.remove("loading");
    fileInput.value = "";
  }
}

function replicatePad(bitmap, p) {
  if (!p) return bitmap;
  const w = bitmap.width, h = bitmap.height;
  const out = document.createElement("canvas");
  out.width = w + 2 * p;
  out.height = h + 2 * p;
  const ctx = out.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, 1, 1, 0, 0, p, p);
  ctx.drawImage(bitmap, w - 1, 0, 1, 1, w + p, 0, p, p);
  ctx.drawImage(bitmap, 0, h - 1, 1, 1, 0, h + p, p, p);
  ctx.drawImage(bitmap, w - 1, h - 1, 1, 1, w + p, h + p, p, p);
  ctx.drawImage(bitmap, p, p);
  ctx.drawImage(bitmap, 0, 0, 1, h, 0, p, p, h);
  ctx.drawImage(bitmap, w - 1, 0, 1, h, w + p, p, p, h);
  ctx.drawImage(bitmap, 0, 0, w, 1, p, 0, w, p);
  ctx.drawImage(bitmap, 0, h - 1, w, 1, p, h + p, w, p);
  return out;
}

function paddedSource() {
  return replicatePad(sourceBitmap, edgePadding);
}

function maxEdgePadding() {
  if (!sourceBitmap) return 0;
  return Math.floor(Math.min(sourceBitmap.width, sourceBitmap.height) * 0.5);
}

function setEdgePadding(px) {
  edgePadding = Math.max(0, Math.min(+px | 0, maxEdgePadding()));
  $("edge-pad-val").textContent = String(edgePadding);
  drawSource();
}

function drawSource() {
  if (!sourceBitmap) return;
  const padded = paddedSource();
  const disp = toDisplayCorners();
  sourceCanvas.width = padded.width;
  sourceCanvas.height = padded.height;
  sCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sCtx.drawImage(padded, 0, 0);
  if (disp.length !== 4) return;

  sCtx.save();
  sCtx.fillStyle = "rgba(0,0,0,0.45)";
  sCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sCtx.globalCompositeOperation = "destination-out";
  sCtx.beginPath();
  sCtx.moveTo(...disp[0]);
  for (let i = 1; i < 4; i++) sCtx.lineTo(...disp[i]);
  sCtx.closePath();
  sCtx.fill();
  sCtx.restore();

  sCtx.strokeStyle = "#6af";
  sCtx.lineWidth = LINE_W;
  sCtx.beginPath();
  sCtx.moveTo(...disp[0]);
  for (let i = 1; i < 4; i++) sCtx.lineTo(...disp[i]);
  sCtx.closePath();
  sCtx.stroke();

  disp.forEach((c, i) => {
    const active = magEnabled && activeCorner === i;
    sCtx.fillStyle = dragging === i ? "#ff6" : active ? "#fa4" : "#6af";
    sCtx.beginPath();
    sCtx.arc(c[0], c[1], HANDLE_R, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.strokeStyle = "#fff";
    sCtx.lineWidth = 2.5;
    sCtx.stroke();
  });
}

function positionMagnifier(clientX, clientY) {
  const w = magnifier.offsetWidth;
  const h = magnifier.offsetHeight;
  let left = clientX + MAG_OFFSET;
  let top = clientY + MAG_OFFSET;
  if (left + w > window.innerWidth - 8) left = clientX - w - MAG_OFFSET;
  if (top + h > window.innerHeight - 8) top = clientY - h - MAG_OFFSET;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  magnifier.style.left = left + "px";
  magnifier.style.top = top + "px";
}

function renderMagnifier() {
  const { clientX, clientY, cx, cy } = magPos;
  const padded = paddedSource();
  const half = MAG_SIZE / (2 * magZoom);
  const sx = Math.max(0, Math.min(cx - half, padded.width - half * 2));
  const sy = Math.max(0, Math.min(cy - half, padded.height - half * 2));

  magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
  magCtx.drawImage(padded, sx, sy, half * 2, half * 2, 0, 0, MAG_SIZE, MAG_SIZE);

  const relX = ((cx - sx) / (half * 2)) * MAG_SIZE;
  const relY = ((cy - sy) / (half * 2)) * MAG_SIZE;
  magCtx.strokeStyle = "#f44";
  magCtx.lineWidth = 1;
  magCtx.beginPath();
  magCtx.moveTo(relX, 0); magCtx.lineTo(relX, MAG_SIZE);
  magCtx.moveTo(0, relY); magCtx.lineTo(MAG_SIZE, relY);
  magCtx.stroke();

  positionMagnifier(clientX, clientY);
}

function showMagnifier(clientX, clientY, cx, cy) {
  if (!magEnabled) return;
  magPos = { clientX, clientY, cx, cy };
  magnifier.style.display = "block";
  renderMagnifier();
}

function hideMagnifier() { magnifier.style.display = "none"; }

function cornerToClient(cx, cy) {
  const rect = sourceCanvas.getBoundingClientRect();
  return {
    clientX: rect.left + cx * rect.width / sourceCanvas.width,
    clientY: rect.top + cy * rect.height / sourceCanvas.height,
  };
}

function updateMagForCorner(i) {
  if (!magEnabled || i < 0) return;
  const disp = toDisplayCorners();
  const [cx, cy] = disp[i];
  const { clientX, clientY } = cornerToClient(cx, cy);
  showMagnifier(clientX, clientY, cx, cy);
}

function enableMag(i) {
  activeCorner = i;
  magEnabled = true;
  updateMagForCorner(i);
  drawSource();
}

function disableMag() {
  magEnabled = false;
  activeCorner = -1;
  hideMagnifier();
  drawSource();
}

magnifier.addEventListener("wheel", e => {
  e.preventDefault();
  e.stopPropagation();
  const step = e.deltaY > 0 ? -0.5 : 0.5;
  magZoom = Math.max(MAG_ZOOM_MIN, Math.min(MAG_ZOOM_MAX, magZoom + step));
  renderMagnifier();
}, { passive: false });
magnifier.addEventListener("click", e => {
  e.stopPropagation();
  disableMag();
});

function canvasPos(e) {
  const rect = sourceCanvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * sourceCanvas.width / rect.width,
    (e.clientY - rect.top) * sourceCanvas.height / rect.height,
  ];
}

function hitTest(x, y) {
  const disp = toDisplayCorners();
  for (let i = 0; i < disp.length; i++) {
    const dx = disp[i][0] - x, dy = disp[i][1] - y;
    if (dx * dx + dy * dy < HANDLE_R * HANDLE_R * 4) return i;
  }
  return -1;
}

function onCornerDrag(e) {
  if (dragging < 0) return;
  const [x, y] = canvasPos(e);
  const maxW = sourceCanvas.width;
  const maxH = sourceCanvas.height;
  const [ox, oy] = origFromDisplay(
    Math.max(0, Math.min(x, maxW)),
    Math.max(0, Math.min(y, maxH)),
    displayScale,
    edgePadding,
  );
  const origW = sourceBitmap.width / displayScale;
  const origH = sourceBitmap.height / displayScale;
  corners[dragging] = [
    Math.max(0, Math.min(ox, origW)),
    Math.max(0, Math.min(oy, origH)),
  ];
  drawSource();
  const disp = toDisplayCorners();
  showMagnifier(e.clientX, e.clientY, disp[dragging][0], disp[dragging][1]);
}

function endCornerDrag() {
  if (dragging >= 0) {
    activeCorner = dragging;
    magEnabled = true;
    updateMagForCorner(activeCorner);
    drawSource();
  }
  dragging = -1;
  window.removeEventListener("mousemove", onCornerDrag);
  window.removeEventListener("mouseup", endCornerDrag);
}

sourceCanvas.addEventListener("mousedown", e => {
  const [x, y] = canvasPos(e);
  dragging = hitTest(x, y);
  if (dragging < 0) return;
  enableMag(dragging);
  window.addEventListener("mousemove", onCornerDrag);
  window.addEventListener("mouseup", endCornerDrag);
});

sourceCanvas.addEventListener("touchstart", e => {
  e.preventDefault();
  const t = e.touches[0];
  const [x, y] = canvasPos(t);
  dragging = hitTest(x, y);
  if (dragging >= 0) enableMag(dragging);
}, { passive: false });
sourceCanvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (dragging < 0) return;
  const t = e.touches[0];
  onCornerDrag(t);
}, { passive: false });
sourceCanvas.addEventListener("touchend", () => {
  if (dragging >= 0) {
    activeCorner = dragging;
    magEnabled = true;
    updateMagForCorner(activeCorner);
    drawSource();
  }
  dragging = -1;
});

$("edge-pad").addEventListener("input", () => setEdgePadding($("edge-pad").value));

$("back-2").addEventListener("click", () => setStep(1));
$("next-2").addEventListener("click", () => {
  setStep(3);
  if ($("preview-mode").value !== "none") doProcess();
});
$("back-3").addEventListener("click", () => { drawSource(); setStep(2); });

function clampView() {
  if (!resultImg) return;
  const w = resultCanvas.width;
  const h = resultCanvas.height;
  viewZoom = Math.max(VIEW_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, viewZoom));
  viewPanX = Math.min(0, Math.max(w - w * viewZoom, viewPanX));
  viewPanY = Math.min(0, Math.max(h - h * viewZoom, viewPanY));
}

function drawResult() {
  if (!resultImg) return;
  clampView();
  const w = resultCanvas.width;
  const h = resultCanvas.height;
  rCtx.setTransform(1, 0, 0, 1, 0, 0);
  rCtx.fillStyle = "#111";
  rCtx.fillRect(0, 0, w, h);
  rCtx.translate(viewPanX, viewPanY);
  rCtx.scale(viewZoom, viewZoom);
  rCtx.drawImage(resultImg, 0, 0);
}

function resultCanvasPos(e) {
  const rect = resultCanvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * resultCanvas.width / rect.width,
    (e.clientY - rect.top) * resultCanvas.height / rect.height,
  ];
}

const previewArea = $("preview-area");

previewArea.addEventListener("wheel", e => {
  if (currentStep !== 3 || !resultImg) return;
  e.preventDefault();
  const [mx, my] = resultCanvasPos(e);
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const newZoom = Math.max(VIEW_ZOOM_MIN, Math.min(VIEW_ZOOM_MAX, viewZoom * factor));
  if (newZoom === viewZoom) return;
  viewPanX = mx - (mx - viewPanX) * (newZoom / viewZoom);
  viewPanY = my - (my - viewPanY) * (newZoom / viewZoom);
  viewZoom = newZoom;
  drawResult();
}, { passive: false });

resultCanvas.addEventListener("mousedown", e => {
  if (currentStep !== 3 || !resultImg) return;
  e.preventDefault();
  viewPanning = true;
  viewPanStart = { cx: e.clientX, cy: e.clientY, panX: viewPanX, panY: viewPanY };
  resultCanvas.classList.add("panning");
});

window.addEventListener("mousemove", e => {
  if (!viewPanning) return;
  const rect = resultCanvas.getBoundingClientRect();
  const sx = resultCanvas.width / rect.width;
  const sy = resultCanvas.height / rect.height;
  viewPanX = viewPanStart.panX + (e.clientX - viewPanStart.cx) * sx;
  viewPanY = viewPanStart.panY + (e.clientY - viewPanStart.cy) * sy;
  drawResult();
});

window.addEventListener("mouseup", () => {
  if (!viewPanning) return;
  viewPanning = false;
  viewPanStart = null;
  resultCanvas.classList.remove("panning");
});

let filters = [];
let filterIdSeq = 0;
let dragFilterId = null;

const FILTER_NAMES = {
  auto_levels: "Auto Levels",
  divide_bg: "Remove Background",
  blur: "Blur",
  unsharp: "Unsharp",
  grayscale: "Grayscale",
  quantize: "Quantize Colors",
};

function addFilter(type) {
  const id = ++filterIdSeq;
  switch (type) {
    case "auto_levels": filters.push({ id, type, low: 0, high: 255 }); break;
    case "divide_bg": filters.push({ id, type, blur: "gaussian", radius: 30, gain: 255 }); break;
    case "blur": filters.push({ id, type, blur: "gaussian", radius: 5 }); break;
    case "unsharp": filters.push({ id, type, radius: 2, amount: 100 }); break;
    case "grayscale": filters.push({ id, type }); break;
    case "quantize": filters.push({ id, type, colors: 16 }); break;
  }
  renderFilterStack();
  schedulePreview();
}

function removeFilter(id) {
  filters = filters.filter(f => f.id !== id);
  renderFilterStack();
  schedulePreview();
}

function renderFilterStack() {
  const stack = $("filter-stack");
  stack.replaceChildren();
  if (!filters.length) {
    const empty = document.createElement("div");
    empty.className = "filter-empty";
    empty.textContent = "No filters — image is warped only";
    stack.appendChild(empty);
    return;
  }
  filters.forEach(f => {
    const card = document.createElement("div");
    card.className = "filter-card";
    card.dataset.id = f.id;

    const head = document.createElement("div");
    head.className = "filter-head";
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.draggable = true;
    const name = document.createElement("span");
    name.className = "filter-name";
    name.textContent = FILTER_NAMES[f.type] || f.type;
    const rm = document.createElement("button");
    rm.className = "filter-remove";
    rm.textContent = "✕";
    rm.addEventListener("click", () => removeFilter(f.id));
    head.append(handle, name, rm);
    card.appendChild(head);

    if (f.type === "auto_levels") {
      const params = document.createElement("div");
      params.className = "filter-params";
      const rangeLbl = document.createElement("label");
      const rangeTop = document.createElement("span");
      rangeTop.innerHTML = 'Input range <span class="radius-val">' + f.low + " – " + f.high + "</span>";
      const dual = document.createElement("div");
      dual.className = "dual-range";
      const track = document.createElement("div");
      track.className = "dual-range-track";
      const lowIn = document.createElement("input");
      lowIn.type = "range";
      lowIn.min = 0; lowIn.max = 255; lowIn.step = 1; lowIn.value = f.low;
      const highIn = document.createElement("input");
      highIn.type = "range";
      highIn.min = 0; highIn.max = 255; highIn.step = 1; highIn.value = f.high;
      const syncRange = () => {
        if (f.low >= f.high) f.low = f.high - 1;
        lowIn.value = f.low;
        highIn.value = f.high;
        rangeTop.querySelector(".radius-val").textContent = f.low + " – " + f.high;
        schedulePreview();
      };
      lowIn.addEventListener("input", () => { f.low = Math.min(+lowIn.value, f.high - 1); syncRange(); });
      highIn.addEventListener("input", () => { f.high = Math.max(+highIn.value, f.low + 1); syncRange(); });
      dual.append(track, lowIn, highIn);
      rangeLbl.append(rangeTop, dual);
      const autoBtn = document.createElement("button");
      autoBtn.type = "button";
      autoBtn.textContent = "Autodetect";
      autoBtn.style.marginTop = "0.35rem";
      autoBtn.addEventListener("click", async () => {
        if (!imageLoaded) return;
        autoBtn.disabled = true;
        try {
          const idx = filters.findIndex(x => x.id === f.id);
          const data = await detectLevels({
            ...getBaseParams(),
            filters: filters.slice(0, idx).map(({ id, ...rest }) => rest),
          });
          f.low = data.low;
          f.high = data.high;
          syncRange();
        } catch {
          alert("Autodetect failed");
        } finally {
          autoBtn.disabled = false;
        }
      });
      params.append(rangeLbl, autoBtn);
      card.appendChild(params);
    }

    if (f.type === "divide_bg") {
      const params = document.createElement("div");
      params.className = "filter-params";
      const blurLbl = document.createElement("label");
      blurLbl.textContent = "Blur";
      const blurSel = document.createElement("select");
      blurSel.innerHTML = '<option value="gaussian">Gaussian</option><option value="median">Median</option>';
      blurSel.value = f.blur;
      blurSel.addEventListener("change", () => { f.blur = blurSel.value; schedulePreview(); });
      blurLbl.appendChild(blurSel);
      const radLbl = document.createElement("label");
      const radTop = document.createElement("span");
      radTop.innerHTML = 'Radius <span class="radius-val">' + f.radius + "</span>";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = 1;
      slider.max = 450;
      slider.step = 1;
      slider.value = f.radius;
      slider.addEventListener("input", () => {
        f.radius = +slider.value;
        radTop.querySelector(".radius-val").textContent = f.radius;
        schedulePreview();
      });
      radLbl.append(radTop, slider);
      const gainLbl = document.createElement("label");
      const gainTop = document.createElement("span");
      gainTop.innerHTML = 'Gain <span class="radius-val">' + f.gain + "</span>";
      const gainSlider = document.createElement("input");
      gainSlider.type = "range";
      gainSlider.min = 1;
      gainSlider.max = 255;
      gainSlider.step = 1;
      gainSlider.value = f.gain;
      gainSlider.addEventListener("input", () => {
        f.gain = +gainSlider.value;
        gainTop.querySelector(".radius-val").textContent = f.gain;
        schedulePreview();
      });
      gainLbl.append(gainTop, gainSlider);
      params.append(blurLbl, radLbl, gainLbl);
      card.appendChild(params);
    }

    if (f.type === "blur") {
      const params = document.createElement("div");
      params.className = "filter-params";
      const blurLbl = document.createElement("label");
      blurLbl.textContent = "Blur";
      const blurSel = document.createElement("select");
      blurSel.innerHTML = '<option value="gaussian">Gaussian</option><option value="median">Median</option>';
      blurSel.value = f.blur;
      blurSel.addEventListener("change", () => { f.blur = blurSel.value; schedulePreview(); });
      blurLbl.appendChild(blurSel);
      const radLbl = document.createElement("label");
      const radTop = document.createElement("span");
      radTop.innerHTML = 'Radius <span class="radius-val">' + f.radius + "</span>";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = 1;
      slider.max = 450;
      slider.step = 1;
      slider.value = f.radius;
      slider.addEventListener("input", () => {
        f.radius = +slider.value;
        radTop.querySelector(".radius-val").textContent = f.radius;
        schedulePreview();
      });
      radLbl.append(radTop, slider);
      params.append(blurLbl, radLbl);
      card.appendChild(params);
    }

    if (f.type === "unsharp") {
      const params = document.createElement("div");
      params.className = "filter-params";
      const radLbl = document.createElement("label");
      const radTop = document.createElement("span");
      radTop.innerHTML = 'Radius <span class="radius-val">' + f.radius + "</span>";
      const radSlider = document.createElement("input");
      radSlider.type = "range";
      radSlider.min = 1;
      radSlider.max = 50;
      radSlider.step = 1;
      radSlider.value = f.radius;
      radSlider.addEventListener("input", () => {
        f.radius = +radSlider.value;
        radTop.querySelector(".radius-val").textContent = f.radius;
        schedulePreview();
      });
      radLbl.append(radTop, radSlider);
      const amtLbl = document.createElement("label");
      const amtTop = document.createElement("span");
      amtTop.innerHTML = 'Amount <span class="radius-val">' + f.amount + "</span>";
      const amtSlider = document.createElement("input");
      amtSlider.type = "range";
      amtSlider.min = 1;
      amtSlider.max = 300;
      amtSlider.step = 1;
      amtSlider.value = f.amount;
      amtSlider.addEventListener("input", () => {
        f.amount = +amtSlider.value;
        amtTop.querySelector(".radius-val").textContent = f.amount;
        schedulePreview();
      });
      amtLbl.append(amtTop, amtSlider);
      params.append(radLbl, amtLbl);
      card.appendChild(params);
    }

    if (f.type === "quantize") {
      const params = document.createElement("div");
      params.className = "filter-params";
      const colLbl = document.createElement("label");
      const colTop = document.createElement("span");
      colTop.innerHTML = 'Colors <span class="radius-val">' + f.colors + "</span>";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = 2;
      slider.max = 256;
      slider.step = 1;
      slider.value = f.colors;
      slider.addEventListener("input", () => {
        f.colors = +slider.value;
        colTop.querySelector(".radius-val").textContent = f.colors;
        schedulePreview();
      });
      colLbl.append(colTop, slider);
      params.appendChild(colLbl);
      card.appendChild(params);
    }

    handle.addEventListener("dragstart", e => {
      dragFilterId = f.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    handle.addEventListener("dragend", () => {
      dragFilterId = null;
      card.classList.remove("dragging");
      stack.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    });
    card.addEventListener("dragover", e => {
      e.preventDefault();
      if (dragFilterId !== null && dragFilterId !== f.id) card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", e => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (dragFilterId === null || dragFilterId === f.id) return;
      const from = filters.findIndex(x => x.id === dragFilterId);
      const to = filters.findIndex(x => x.id === f.id);
      const [item] = filters.splice(from, 1);
      filters.splice(to, 0, item);
      renderFilterStack();
      schedulePreview();
    });

    stack.appendChild(card);
  });
}

$("add-auto-levels").addEventListener("click", () => addFilter("auto_levels"));
$("add-divide-bg").addEventListener("click", () => addFilter("divide_bg"));
$("add-blur").addEventListener("click", () => addFilter("blur"));
$("add-unsharp").addEventListener("click", () => addFilter("unsharp"));
$("add-grayscale").addEventListener("click", () => addFilter("grayscale"));
$("add-quantize").addEventListener("click", () => addFilter("quantize"));

function updateExportUI() {
  const isPng = $("export-format").value === "png";
  $("png-export-opts").classList.toggle("hidden", !isPng);
  $("jpeg-export-opts").classList.toggle("hidden", isPng);
  $("png-colors-wrap").classList.toggle("hidden", $("png-mode").value !== "indexed");
}

$("export-format").addEventListener("change", updateExportUI);
$("png-mode").addEventListener("change", updateExportUI);
$("png-compress").addEventListener("input", () => {
  $("png-compress-val").textContent = $("png-compress").value;
});
$("png-colors").addEventListener("input", () => {
  $("png-colors-val").textContent = $("png-colors").value;
});
$("jpeg-quality").addEventListener("input", () => {
  $("jpeg-quality-val").textContent = $("jpeg-quality").value;
});
updateExportUI();

let uploadAbort = null;
let processGen = 0;
let exportBusy = false;

function updateCancelBtn() {
  const busy = !!(uploadAbort || processGen > 0 && $("apply-btn").disabled || exportBusy);
  document.querySelectorAll(".cancel-op").forEach(b => b.classList.toggle("hidden", !busy));
}

function cancelOperation() {
  clearTimeout(previewTimer);
  const gen = processGen;
  ++processGen;
  cancelWorker(gen);
  if (uploadAbort) { uploadAbort.abort(); uploadAbort = null; }
  dropZone.classList.remove("loading");
  $("apply-btn").disabled = false;
  $("download-btn").disabled = false;
  exportBusy = false;
  if (currentStep === 3) $("preview-status").textContent = "Cancelled";
  updateCancelBtn();
}

document.querySelectorAll(".cancel-op").forEach(b => b.addEventListener("click", cancelOperation));

let appliedCustom = { width: 210, height: 297, unit: "mm" };

function readCustomInputs() {
  return {
    width: +$("custom-w").value,
    height: +$("custom-h").value,
    unit: $("custom-unit").value,
  };
}

function customInputsValid(c = readCustomInputs()) {
  return (c.unit === "mm" || c.unit === "in")
    && Number.isFinite(c.width) && c.width > 0 && c.width <= 1000
    && Number.isFinite(c.height) && c.height > 0 && c.height <= 1000;
}

function updateCustomApplyBtn() {
  $("custom-apply").disabled = !customInputsValid();
}

function applyCustomFormat() {
  const c = readCustomInputs();
  if (!customInputsValid(c)) return;
  appliedCustom = c;
  schedulePreview();
}

function getBaseParams() {
  const params = {
    corners: corners.map(c => [...c]),
    format: $("format").value,
    padding: paddingInOriginal(edgePadding, displayScale),
  };
  if ($("format").value === "custom") {
    params.custom_width = appliedCustom.width;
    params.custom_height = appliedCustom.height;
    params.custom_unit = appliedCustom.unit;
  }
  return params;
}

function getParams() {
  return {
    ...getBaseParams(),
    filters: filters.map(({ id, ...rest }) => rest),
    preview_mode: $("preview-mode").value,
  };
}

function getExportParams() {
  return {
    ...getParams(),
    file_format: $("export-format").value,
    png_mode: $("png-mode").value,
    png_compress: +$("png-compress").value,
    png_colors: +$("png-colors").value,
    jpeg_quality: +$("jpeg-quality").value,
  };
}

let previewTimer = null;
function schedulePreview() {
  const mode = $("preview-mode").value;
  if (mode === "none" || currentStep !== 3) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(doProcess, mode === "full" ? 500 : 300);
}

async function doProcess() {
  if (!imageLoaded) return;
  const gen = ++processGen;
  cancelWorker(gen - 1);

  $("preview-status").textContent = "Processing…";
  $("apply-btn").disabled = true;
  updateCancelBtn();
  try {
    const data = await processImage(getParams(), gen);
    if (gen !== processGen) return;
    if (data.type === "cancelled") return;

    const oldW = resultCanvas.width;
    const oldH = resultCanvas.height;
    if (resultImg && resultImg.close) resultImg.close();
    resultImg = data.preview;
    resultCanvas.width = data.width;
    resultCanvas.height = data.height;
    if (oldW && oldH) {
      viewPanX *= data.width / oldW;
      viewPanY *= data.height / oldH;
    }
    drawResult();
    const mode = $("preview-mode").value;
    const modeLabel = mode === "full" ? "full" : mode === "fast" ? "fast" : "";
    $("preview-status").textContent =
      `Preview${modeLabel ? ` (${modeLabel})` : ""}: ${data.width} × ${data.height} px · ${Math.round(viewZoom * 100)}%`;
  } catch (e) {
    if (gen !== processGen) return;
    $("preview-status").textContent = "Processing failed";
  } finally {
    if (gen === processGen) {
      $("apply-btn").disabled = false;
      updateCancelBtn();
    }
  }
}

$("apply-btn").addEventListener("click", () => { clearTimeout(previewTimer); doProcess(); });
$("preview-mode").addEventListener("change", schedulePreview);

function updateFormatUI() {
  $("custom-format").classList.toggle("hidden", $("format").value !== "custom");
  updateCustomApplyBtn();
}

$("format").addEventListener("change", () => {
  updateFormatUI();
  if ($("format").value !== "custom") schedulePreview();
});
$("custom-apply").addEventListener("click", applyCustomFormat);
["custom-w", "custom-h", "custom-unit"].forEach(id => {
  $(id).addEventListener("input", updateCustomApplyBtn);
  $(id).addEventListener("change", updateCustomApplyBtn);
});
$("custom-unit").value = appliedCustom.unit;
updateFormatUI();

$("download-btn").addEventListener("click", async () => {
  if (!imageLoaded) return;
  const gen = ++processGen;
  cancelWorker(gen - 1);
  exportBusy = true;
  $("download-btn").disabled = true;
  $("preview-status").textContent = "Exporting…";
  updateCancelBtn();
  try {
    const data = await exportImage(getExportParams(), gen);
    if (gen !== processGen) return;
    if (data.type === "cancelled") return;
    const blob = new Blob([data.buffer], { type: data.mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = downloadFilename();
    a.click();
    URL.revokeObjectURL(a.href);
    $("preview-status").textContent = "Downloaded";
  } catch (e) {
    if (gen !== processGen) return;
    alert("Export failed");
    $("preview-status").textContent = "Export failed";
  } finally {
    if (gen === processGen) {
      exportBusy = false;
      $("download-btn").disabled = false;
      updateCancelBtn();
    }
  }
});

renderFilterStack();
