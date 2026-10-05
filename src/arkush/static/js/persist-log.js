/** Debug logging (filter console with "arkush:persist" or "arkush:process") */
export function plog(...args) {
  console.log("[arkush:persist]", ...args);
}

export function plogWarn(...args) {
  console.warn("[arkush:persist]", ...args);
}

export function plogError(...args) {
  console.error("[arkush:persist]", ...args);
}

export function procLog(...args) {
  console.log("[arkush:process]", ...args);
}

export function procLogError(...args) {
  console.error("[arkush:process]", ...args);
}

export function summarizeProcessParams(p) {
  if (!p) return p;
  return {
    format: p.format,
    preview_mode: p.preview_mode,
    padding: p.padding,
    filterCount: p.filters?.length ?? 0,
    filterTypes: p.filters?.map(f => f.type),
    cornerCount: p.corners?.length ?? 0,
    custom: p.format === "custom"
      ? { w: p.custom_width, h: p.custom_height, u: p.custom_unit }
      : undefined,
  };
}
