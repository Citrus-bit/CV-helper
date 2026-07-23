export type PixelRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfVisualMetrics = {
  sampledPixels: number;
  visiblePixelRatio: number;
  strongContrastPixelRatio: number;
  luminanceRange: number;
  luminanceStandardDeviation: number;
};

export const PDF_VISUAL_THRESHOLDS = {
  visiblePixelContrast: 12,
  strongPixelContrast: 32,
  minimumVisiblePixelRatio: 0.001,
  minimumStrongContrastPixelRatio: 0.0005,
  minimumPageLuminanceRange: 32,
  minimumPageLuminanceStandardDeviation: 2,
  minimumTextLuminanceRange: 24,
  minimumTextLuminanceStandardDeviation: 2,
} as const;

function emptyMetrics(): PdfVisualMetrics {
  return {
    sampledPixels: 0,
    visiblePixelRatio: 0,
    strongContrastPixelRatio: 0,
    luminanceRange: 0,
    luminanceStandardDeviation: 0,
  };
}

export function analyzeRgbaPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
  region: PixelRegion = { x: 0, y: 0, width, height },
): PdfVisualMetrics {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return emptyMetrics();
  }
  if (data.length < width * height * 4) return emptyMetrics();

  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(width, Math.ceil(region.x + region.width));
  const bottom = Math.min(height, Math.ceil(region.y + region.height));
  if (right <= left || bottom <= top) return emptyMetrics();

  let sampledPixels = 0;
  let visiblePixels = 0;
  let strongContrastPixels = 0;
  let minimumLuminance = 255;
  let maximumLuminance = 0;
  let luminanceMean = 0;
  let luminanceM2 = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha =
        Math.max(0, Math.min(255, Number(data[offset + 3]) || 0)) / 255;
      const red = (Number(data[offset]) || 0) * alpha + 255 * (1 - alpha);
      const green = (Number(data[offset + 1]) || 0) * alpha + 255 * (1 - alpha);
      const blue = (Number(data[offset + 2]) || 0) * alpha + 255 * (1 - alpha);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const visibleContrast = Math.max(255 - red, 255 - green, 255 - blue);
      const luminanceContrast = 255 - luminance;

      sampledPixels += 1;
      if (visibleContrast >= PDF_VISUAL_THRESHOLDS.visiblePixelContrast)
        visiblePixels += 1;
      if (luminanceContrast >= PDF_VISUAL_THRESHOLDS.strongPixelContrast)
        strongContrastPixels += 1;
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
      const delta = luminance - luminanceMean;
      luminanceMean += delta / sampledPixels;
      luminanceM2 += delta * (luminance - luminanceMean);
    }
  }

  return {
    sampledPixels,
    visiblePixelRatio: visiblePixels / sampledPixels,
    strongContrastPixelRatio: strongContrastPixels / sampledPixels,
    luminanceRange: maximumLuminance - minimumLuminance,
    luminanceStandardDeviation: Math.sqrt(luminanceM2 / sampledPixels),
  };
}

export function hasMeaningfulPageVisuals(metrics: PdfVisualMetrics) {
  return (
    metrics.sampledPixels > 0 &&
    metrics.visiblePixelRatio >=
      PDF_VISUAL_THRESHOLDS.minimumVisiblePixelRatio &&
    metrics.strongContrastPixelRatio >=
      PDF_VISUAL_THRESHOLDS.minimumStrongContrastPixelRatio &&
    metrics.luminanceRange >= PDF_VISUAL_THRESHOLDS.minimumPageLuminanceRange &&
    metrics.luminanceStandardDeviation >=
      PDF_VISUAL_THRESHOLDS.minimumPageLuminanceStandardDeviation
  );
}

export function hasVisibleTextContrast(metrics: PdfVisualMetrics) {
  return (
    metrics.sampledPixels > 0 &&
    metrics.luminanceRange >= PDF_VISUAL_THRESHOLDS.minimumTextLuminanceRange &&
    metrics.luminanceStandardDeviation >=
      PDF_VISUAL_THRESHOLDS.minimumTextLuminanceStandardDeviation
  );
}
