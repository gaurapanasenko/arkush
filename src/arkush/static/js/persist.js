/** IndexedDB storage for saved scans */
import { SCHEMA_VERSION, sortDocuments } from "./pure/session-state.js";

const DB_NAME = "arkush";
const DB_VERSION = 1;

let dbPromise = null;

export function cloneBuffer(buf) {
  if (!buf) return null;
  if (buf instanceof ArrayBuffer) return buf.slice(0);
  if (ArrayBuffer.isView(buf)) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return null;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException("Aborted", "AbortError"));
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("app")) db.createObjectStore("app", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStores(mode, names, fn) {
  const db = await openDB();
  const tx = db.transaction(names, mode);
  const stores = Object.fromEntries(names.map(n => [n, tx.objectStore(n)]));
  const result = await fn(stores, tx);
  await txDone(tx);
  return result;
}

export async function getAppState() {
  return withStores("readonly", ["app"], async ({ app }) => {
    const row = await reqToPromise(app.get("state"));
    if (!row || row.schemaVersion !== SCHEMA_VERSION) return { activeDocumentId: null };
    return row;
  });
}

export async function setActiveDocument(id) {
  return withStores("readwrite", ["app"], async ({ app }) => {
    await reqToPromise(app.put({ id: "state", schemaVersion: SCHEMA_VERSION, activeDocumentId: id }));
  });
}

export async function listDocuments() {
  return withStores("readonly", ["documents"], async ({ documents }) => {
    const all = await reqToPromise(documents.getAll());
    return sortDocuments(all.filter(d => d.schemaVersion === SCHEMA_VERSION));
  });
}

export async function getBlob(id) {
  return withStores("readonly", ["blobs"], async ({ blobs }) => {
    const row = await reqToPromise(blobs.get(id));
    return row?.buffer || null;
  });
}

export async function getDocument(id) {
  return withStores("readonly", ["documents", "blobs"], async ({ documents, blobs }) => {
    const doc = await reqToPromise(documents.get(id));
    if (!doc || doc.schemaVersion !== SCHEMA_VERSION) return null;
    const image = await reqToPromise(blobs.get(doc.blobId));
    const thumb = await reqToPromise(blobs.get(doc.thumbBlobId));
    return {
      ...doc,
      imageBuffer: cloneBuffer(image?.buffer),
      thumbBuffer: cloneBuffer(thumb?.buffer),
    };
  });
}

export async function createDocument(meta, imageBuffer, thumbBuffer) {
  const id = crypto.randomUUID();
  const blobId = crypto.randomUUID();
  const thumbBlobId = crypto.randomUUID();
  const doc = {
    ...meta,
    id,
    blobId,
    thumbBlobId,
  };
  await withStores("readwrite", ["documents", "blobs", "app"], async ({ documents, blobs, app }) => {
    await reqToPromise(blobs.put({ id: blobId, buffer: cloneBuffer(imageBuffer) }));
    await reqToPromise(blobs.put({ id: thumbBlobId, buffer: cloneBuffer(thumbBuffer) }));
    await reqToPromise(documents.put(doc));
    await reqToPromise(app.put({ id: "state", schemaVersion: SCHEMA_VERSION, activeDocumentId: id }));
  });
  return doc;
}

export async function updateDocument(id, patch) {
  return withStores("readwrite", ["documents"], async ({ documents }) => {
    const doc = await reqToPromise(documents.get(id));
    if (!doc) return null;
    const next = { ...doc, ...patch, id, updatedAt: patch.updatedAt || new Date().toISOString() };
    await reqToPromise(documents.put(next));
    return next;
  });
}

export async function touchDocument(id) {
  const now = new Date().toISOString();
  return updateDocument(id, { lastOpenedAt: now });
}

export async function deleteDocument(id) {
  return withStores("readwrite", ["documents", "blobs", "app"], async ({ documents, blobs, app }) => {
    const doc = await reqToPromise(documents.get(id));
    if (!doc) return null;
    await reqToPromise(blobs.delete(doc.blobId));
    await reqToPromise(blobs.delete(doc.thumbBlobId));
    await reqToPromise(documents.delete(id));
    const state = await reqToPromise(app.get("state"));
    if (state?.activeDocumentId === id) {
      const remaining = sortDocuments(
        (await reqToPromise(documents.getAll())).filter(d => d.schemaVersion === SCHEMA_VERSION),
      );
      await reqToPromise(app.put({
        id: "state",
        schemaVersion: SCHEMA_VERSION,
        activeDocumentId: remaining[0]?.id || null,
      }));
    }
    return doc;
  });
}

export async function clearAll() {
  return withStores("readwrite", ["documents", "blobs", "app"], async ({ documents, blobs, app }) => {
    await reqToPromise(documents.clear());
    await reqToPromise(blobs.clear());
    await reqToPromise(app.put({ id: "state", schemaVersion: SCHEMA_VERSION, activeDocumentId: null }));
  });
}
