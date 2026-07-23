import { describe, expect, it } from "vitest";

import {
  analyzeRgbaPixels,
  hasMeaningfulPageVisuals,
  hasVisibleTextContrast,
} from "./pdf-visual-audit";

function solidPixels(
  width: number,
  height: number,
  rgba: [number, number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4)
    data.set(rgba, offset);
  return data;
}

describe("PDF visual pixel audit", () => {
  it("rejects transparent and pure-white canvases", () => {
    for (const pixels of [
      solidPixels(100, 100, [0, 0, 0, 0]),
      solidPixels(100, 100, [255, 255, 255, 255]),
    ]) {
      expect(
        hasMeaningfulPageVisuals(analyzeRgbaPixels(pixels, 100, 100)),
      ).toBe(false);
    }
  });

  it("rejects a uniformly colored canvas without actual marks", () => {
    const pixels = solidPixels(100, 100, [230, 230, 230, 255]);
    expect(hasMeaningfulPageVisuals(analyzeRgbaPixels(pixels, 100, 100))).toBe(
      false,
    );
  });

  it("accepts a deliberately sparse high-contrast minimalist page", () => {
    const pixels = solidPixels(200, 200, [255, 255, 255, 255]);
    for (let y = 30; y < 34; y += 1) {
      for (let x = 25; x < 75; x += 1) {
        const offset = (y * 200 + x) * 4;
        pixels.set([35, 42, 52, 255], offset);
      }
    }
    const metrics = analyzeRgbaPixels(pixels, 200, 200);
    expect(metrics.visiblePixelRatio).toBeCloseTo(0.005, 5);
    expect(hasMeaningfulPageVisuals(metrics)).toBe(true);
    expect(
      hasVisibleTextContrast(
        analyzeRgbaPixels(pixels, 200, 200, {
          x: 20,
          y: 25,
          width: 60,
          height: 14,
        }),
      ),
    ).toBe(true);
  });
});
