/** Main-thread API for the processing worker */
"use strict";

let worker = null;
let ready = false;
let readyPromise = null;
let readyResolve = null;
let msgId = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL("worker.js", import.meta.url));
  worker.onmessage = e => {
    const msg = e.data;
    if (msg.type === "ready") {
      ready = true;
      if (readyResolve) readyResolve();
      return;
    }
    if (msg.gen !== undefined) {
      const key = `g${msg.gen}`;
      const handlers = pending.get(key);
      if (!handlers) return;
      if (msg.type === "processed" || msg.type === "exported" || msg.type === "cancelled" || msg.type === "error") {
        pending.delete(key);
        if (msg.type === "error") handlers.reject(new Error(msg.message));
        else handlers.resolve(msg);
      }
      return;
    }
    if (msg.id !== undefined) {
      const key = `i${msg.id}`;
      const handlers = pending.get(key);
      if (!handlers) return;
      pending.delete(key);
      if (msg.type === "error") handlers.reject(new Error(msg.message));
      else handlers.resolve(msg);
    }
  };
  worker.onerror = e => {
    console.error("Worker error:", e);
  };
}

export function waitForReady() {
  ensureWorker();
  if (ready) return Promise.resolve();
  if (!readyPromise) {
    readyPromise = new Promise(resolve => { readyResolve = resolve; });
  }
  return readyPromise;
}

function nextId() {
  return ++msgId;
}

function postImageJob(type, buffer, extra, signal) {
  return waitForReady().then(() => new Promise((resolve, reject) => {
    const id = nextId();
    const key = `i${id}`;
    pending.set(key, { resolve, reject });
    if (signal) {
      if (signal.aborted) { pending.delete(key); reject(new DOMException("Aborted", "AbortError")); return; }
      signal.addEventListener("abort", () => {
        pending.delete(key);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
    worker.postMessage({ type, id, buffer, ...extra }, [buffer]);
  }));
}

export function detectImage(buffer, signal) {
  return postImageJob("detect", buffer, {}, signal);
}

export function restoreImage(buffer, corners, scale) {
  return postImageJob("restore", buffer, { corners, scale });
}

export function processImage(params, gen) {
  return waitForReady().then(() => new Promise((resolve, reject) => {
    const key = `g${gen}`;
    pending.set(key, { resolve, reject });
    worker.postMessage({ type: "process", gen, params });
  }));
}

export function detectLevels(params) {
  return waitForReady().then(() => new Promise((resolve, reject) => {
    const id = nextId();
    pending.set(`i${id}`, { resolve, reject });
    worker.postMessage({ type: "detectLevels", id, params });
  }));
}

export function exportImage(params, gen) {
  return waitForReady().then(() => new Promise((resolve, reject) => {
    const key = `g${gen}`;
    pending.set(key, { resolve, reject });
    worker.postMessage({ type: "export", gen, params });
  }));
}

export function cancelWorker(gen) {
  if (worker) worker.postMessage({ type: "cancel", gen });
}

export function clearWorker() {
  if (worker) worker.postMessage({ type: "clear" });
}
