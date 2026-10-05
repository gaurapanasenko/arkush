function cacheKeyHex(text) {
  // ponytail: FNV-1a when SubtleCrypto unavailable (http:// LAN)
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const h2 = Math.imul((h ^ text.length) >>> 0, 2246822507) >>> 0;
  return (h >>> 0).toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export async function processKey(payload) {
  const text = JSON.stringify(payload);
  if (globalThis.crypto?.subtle?.digest) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .slice(0, 8)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return cacheKeyHex(text);
}
