export const SCHEMA_VERSION = 1;

export function sortDocuments(docs) {
  return [...docs].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  );
}

export function stripFilterIds(filters) {
  return filters.map(({ id, ...rest }) => rest);
}

export function filtersWithIds(stored, filterIdSeq = 0) {
  let seq = 0;
  const filters = (stored || []).map(f => ({ ...f, id: ++seq }));
  return { filters, filterIdSeq: Math.max(filterIdSeq | 0, seq) };
}

export function documentPatchFromUI(state) {
  const patch = {
    schemaVersion: SCHEMA_VERSION,
    corners: state.corners.map(c => [...c]),
    displayScale: state.displayScale,
    edgePadding: state.edgePadding,
    filterIdSeq: state.filterIdSeq,
    filters: stripFilterIds(state.filters),
    format: state.format,
    appliedCustom: { ...state.appliedCustom },
    customInputs: { ...state.customInputs },
    exportFilename: state.exportFilename,
    exportFormat: state.exportFormat,
    pngMode: state.pngMode,
    pngCompress: state.pngCompress,
    pngColors: state.pngColors,
    jpegQuality: state.jpegQuality,
    previewMode: state.previewMode,
    updatedAt: new Date().toISOString(),
  };
  if (state.currentStep >= 2) patch.lastStep = state.currentStep;
  return patch;
}

export function newDocumentMeta(name, mimeType, detect, exportFilename) {
  const now = new Date().toISOString();
  const base = exportFilename || name.replace(/\.[^.]+$/, "") || "scan";
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    mimeType,
    corners: detect.corners.map(c => [...c]),
    displayScale: detect.scale ?? 1,
    edgePadding: 0,
    lastStep: 2,
    filterIdSeq: 0,
    filters: [],
    format: "a4",
    appliedCustom: { width: 210, height: 297, unit: "mm" },
    customInputs: { width: 210, height: 297, unit: "mm" },
    exportFilename: base,
    exportFormat: "jpeg",
    pngMode: "rgb",
    pngCompress: 9,
    pngColors: 256,
    jpegQuality: 65,
    previewMode: "fast",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
}
