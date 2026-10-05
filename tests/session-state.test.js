import { describe, expect, it } from "vitest";
import {
  documentPatchFromUI,
  filtersWithIds,
  newDocumentMeta,
  sortDocuments,
  stripFilterIds,
} from "../src/arkush/static/js/pure/session-state.js";

describe("session-state", () => {
  it("sorts documents by lastOpenedAt desc", () => {
    const docs = sortDocuments([
      { id: "a", lastOpenedAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", lastOpenedAt: "2026-01-03T00:00:00.000Z" },
      { id: "c", lastOpenedAt: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(docs.map(d => d.id)).toEqual(["b", "c", "a"]);
  });

  it("strips and restores filter ids", () => {
    const filters = [{ id: 9, type: "grayscale" }];
    expect(stripFilterIds(filters)).toEqual([{ type: "grayscale" }]);
    expect(filtersWithIds([{ type: "blur", radius: 5 }], 0)).toEqual({
      filters: [{ id: 1, type: "blur", radius: 5 }],
      filterIdSeq: 1,
    });
  });

  it("builds document patch from UI state", () => {
    const patch = documentPatchFromUI({
      corners: [[0, 0], [1, 0], [1, 1], [0, 1]],
      displayScale: 0.5,
      edgePadding: 10,
      currentStep: 3,
      filterIdSeq: 1,
      filters: [{ id: 1, type: "grayscale" }],
      format: "a4",
      appliedCustom: { width: 210, height: 297, unit: "mm" },
      customInputs: { width: 210, height: 297, unit: "mm" },
      exportFilename: "scan",
      exportFormat: "jpeg",
      pngMode: "rgb",
      pngCompress: 9,
      pngColors: 256,
      jpegQuality: 65,
      previewMode: "fast",
    });
    expect(patch.filters).toEqual([{ type: "grayscale" }]);
    expect(patch.lastStep).toBe(3);
    expect(patch.edgePadding).toBe(10);
  });

  it("does not overwrite lastStep while browsing step 1", () => {
    const patch = documentPatchFromUI({
      corners: [],
      displayScale: 1,
      edgePadding: 0,
      currentStep: 1,
      filterIdSeq: 0,
      filters: [],
      format: "a4",
      appliedCustom: { width: 210, height: 297, unit: "mm" },
      customInputs: { width: 210, height: 297, unit: "mm" },
      exportFilename: "scan",
      exportFormat: "jpeg",
      pngMode: "rgb",
      pngCompress: 9,
      pngColors: 256,
      jpegQuality: 65,
      previewMode: "fast",
    });
    expect(patch.lastStep).toBeUndefined();
  });

  it("creates defaults for a new document", () => {
    const meta = newDocumentMeta("doc.jpg", "image/jpeg", {
      corners: [[0, 0], [100, 0], [100, 50], [0, 50]],
      scale: 0.25,
    }, "doc");
    expect(meta.name).toBe("doc.jpg");
    expect(meta.exportFilename).toBe("doc");
    expect(meta.corners).toHaveLength(4);
    expect(meta.lastStep).toBe(2);
  });
});
