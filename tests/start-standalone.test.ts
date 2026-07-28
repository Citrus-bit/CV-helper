import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const launcher = path.join(projectRoot, "scripts", "start-standalone.mjs");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function standaloneFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "resume-standalone-test-"));
  temporaryDirectories.push(root);
  await Promise.all([
    mkdir(path.join(root, ".next", "standalone"), { recursive: true }),
    mkdir(path.join(root, ".next", "static"), { recursive: true }),
    mkdir(path.join(root, ".tools", "typst"), { recursive: true }),
    mkdir(path.join(root, "templates", "typst"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      path.join(root, ".next", "standalone", "server.js"),
      "process.exit(0);\n",
    ),
    writeFile(path.join(root, ".next", "static", "build.txt"), "static"),
    writeFile(
      path.join(root, ".tools", "typst", "typst"),
      "#!/bin/sh\nexit 0\n",
    ),
    writeFile(
      path.join(root, "templates", "typst", "professional.typ"),
      "template",
    ),
  ]);
  await chmod(path.join(root, ".tools", "typst", "typst"), 0o755);
  return root;
}

describe("standalone launcher", () => {
  it("copies PDF rendering assets into the standalone runtime", async () => {
    const root = await standaloneFixture();

    await execFileAsync(process.execPath, [launcher], { cwd: root });

    await expect(
      readFile(
        path.join(
          root,
          ".next",
          "standalone",
          ".tools",
          "typst",
          "typst",
        ),
        "utf8",
      ),
    ).resolves.toContain("#!/bin/sh");
    await expect(
      readFile(
        path.join(
          root,
          ".next",
          "standalone",
          "templates",
          "typst",
          "professional.typ",
        ),
        "utf8",
      ),
    ).resolves.toBe("template");
  });

  it("fails at startup with setup guidance when Typst is missing", async () => {
    const root = await standaloneFixture();
    await rm(path.join(root, ".tools", "typst"), { recursive: true, force: true });

    await expect(
      execFileAsync(process.execPath, [launcher], { cwd: root }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("bash scripts/bootstrap-tools.sh"),
    });
  });
});
