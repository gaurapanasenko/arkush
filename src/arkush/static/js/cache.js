/** LRU cache for processed results in the worker */
"use strict";

function createCache(budgetBytes) {
  const entries = new Map();
  let totalBytes = 0;

  function nbytes(mat) {
    return mat.rows * mat.cols * mat.channels();
  }

  function evict(extra) {
    while (totalBytes + extra > budgetBytes && entries.size > 0) {
      const oldest = entries.keys().next().value;
      const mat = entries.get(oldest);
      totalBytes -= nbytes(mat);
      mat.delete();
      entries.delete(oldest);
    }
  }

  return {
    get(key) {
      const mat = entries.get(key);
      if (!mat) return null;
      entries.delete(key);
      entries.set(key, mat);
      return mat;
    },
    set(key, mat) {
      if (entries.has(key)) {
        const old = entries.get(key);
        totalBytes -= nbytes(old);
        old.delete();
        entries.delete(key);
      }
      const size = nbytes(mat);
      evict(size);
      entries.set(key, mat);
      totalBytes += size;
    },
    clear() {
      for (const mat of entries.values()) mat.delete();
      entries.clear();
      totalBytes = 0;
    },
  };
}

async function processKey(payload) {
  const text = JSON.stringify(payload);
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
