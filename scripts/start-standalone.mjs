import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const serverPath = path.join(standaloneRoot, "server.js");

async function copyRequiredDirectory(relativePath, setupHint) {
  const source = path.join(projectRoot, relativePath);
  try {
    await stat(source);
  } catch {
    console.error(
      `Required runtime assets not found: ${relativePath}. ${setupHint}`,
    );
    process.exit(1);
  }
  await cp(source, path.join(standaloneRoot, relativePath), {
    recursive: true,
    force: true,
  });
}

try {
  await stat(serverPath);
} catch {
  console.error("Standalone build not found. Run `pnpm build` first.");
  process.exit(1);
}

await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneRoot, ".next", "static"),
  { recursive: true, force: true },
);

await copyRequiredDirectory(
  ".tools/typst",
  "Run `bash scripts/bootstrap-tools.sh` before starting the app.",
);
await copyRequiredDirectory(
  "templates/typst",
  "Restore the Typst templates before starting the app.",
);

try {
  await stat(path.join(projectRoot, "public"));
  await cp(
    path.join(projectRoot, "public"),
    path.join(standaloneRoot, "public"),
    { recursive: true, force: true },
  );
} catch {
  // The app currently has no required public directory.
}

const child = spawn(process.execPath, ["server.js"], {
  cwd: standaloneRoot,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
