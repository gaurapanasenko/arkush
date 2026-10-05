/** Debug logging for local persistence (always on; filter console with "arkush:persist") */
export function plog(...args) {
  console.log("[arkush:persist]", ...args);
}

export function plogWarn(...args) {
  console.warn("[arkush:persist]", ...args);
}

export function plogError(...args) {
  console.error("[arkush:persist]", ...args);
}
