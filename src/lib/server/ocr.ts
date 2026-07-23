import path from "node:path";

export function getOfflineTesseractOptions() {
  const configuredPath = process.env.TESSERACT_LANG_PATH ?? ".tools/tesseract";
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(configuredPath)) {
    throw new Error("TESSERACT_LANG_PATH must reference a local directory.");
  }

  return {
    cacheMethod: "none",
    gzip: true,
    langPath: path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      configuredPath,
    ),
    logger: () => undefined,
  };
}
