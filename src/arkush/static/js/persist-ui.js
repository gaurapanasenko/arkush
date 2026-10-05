/** Saved scans strip under the drop zone */
import { getBlob } from "./persist.js";
import { plog } from "./persist-log.js";

const thumbUrls = new Map();

export async function createThumbnail(bitmap, max = 160) {
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, cw, ch);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error("Thumbnail failed"))),
      "image/jpeg",
      0.7,
    );
  });
}

export function revokeSavedScanUrls() {
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
}

export async function renderSavedScans(root, strip, docs, activeId, { onOpen, onDelete }) {
  revokeSavedScanUrls();
  root.classList.toggle("hidden", docs.length === 0);
  strip.replaceChildren();
  for (const doc of docs) {
    const card = document.createElement("div");
    card.className = "saved-scan-card" + (doc.id === activeId ? " active" : "");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "saved-scan-open";
    btn.title = doc.name;

    const img = document.createElement("img");
    img.alt = doc.name;
    const thumb = await getBlob(doc.thumbBlobId);
    if (thumb) {
      const url = URL.createObjectURL(new Blob([thumb], { type: "image/jpeg" }));
      thumbUrls.set(doc.id, url);
      img.src = url;
    }
    btn.appendChild(img);
    btn.addEventListener("click", () => {
      plog("thumb click", { id: doc.id, name: doc.name, activeId });
      onOpen(doc.id);
    });

    const name = document.createElement("span");
    name.className = "saved-scan-name";
    name.textContent = doc.exportFilename || doc.name;

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "saved-scan-remove";
    rm.textContent = "✕";
    rm.addEventListener("click", e => {
      e.stopPropagation();
      onDelete(doc.id);
    });

    card.append(btn, name, rm);
    strip.appendChild(card);
  }
}

export async function thumbBufferFromPreview(preview) {
  const blob = await createThumbnail(preview);
  return blob.arrayBuffer();
}
