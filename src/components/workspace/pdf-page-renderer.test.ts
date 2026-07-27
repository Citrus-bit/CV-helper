// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  canvasContainsRenderedPixels,
  decodePdfBase64,
} from "./pdf-page-renderer";

describe("PDF page renderer guards", () => {
  it("decodes bare and data-URL PDF payloads", () => {
    expect([...decodePdfBase64("JVBERi0=")]).toEqual([37, 80, 68, 70, 45]);
    expect([
      ...decodePdfBase64("data:application/pdf;base64,JVBERi0="),
    ]).toEqual([37, 80, 68, 70, 45]);
  });

  it("rejects transparent and white canvases while accepting sparse visible ink", () => {
    const contextWith = (data: Uint8ClampedArray) =>
      ({
        getImageData: () => ({ data }),
      }) as unknown as CanvasRenderingContext2D;
    const solid = (rgba: [number, number, number, number]) => {
      const data = new Uint8ClampedArray(100 * 100 * 4);
      for (let offset = 0; offset < data.length; offset += 4)
        data.set(rgba, offset);
      return data;
    };
    const visible = solid([255, 255, 255, 255]);
    for (let index = 0; index < 100; index += 1) {
      visible.set([30, 35, 40, 255], index * 4);
    }

    expect(
      canvasContainsRenderedPixels(contextWith(solid([0, 0, 0, 0])), 100, 100),
    ).toBe(false);
    expect(
      canvasContainsRenderedPixels(
        contextWith(solid([255, 255, 255, 255])),
        100,
        100,
      ),
    ).toBe(false);
    expect(canvasContainsRenderedPixels(contextWith(visible), 100, 100)).toBe(
      true,
    );
  });
});
