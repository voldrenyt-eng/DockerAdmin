import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const strictSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const workspacePackageManifestPaths = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/shared/package.json",
];

const readJsonFile = async (path) => {
  return JSON.parse(await readFile(path, "utf8"));
};

const writeJsonFile = async (path, value) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const assertValidReleaseVersion = (version) => {
  if (!strictSemverPattern.test(version)) {
    throw new Error(
      "Release version must be a strict semver string like 0.2.0",
    );
  }

  return version;
};

export const syncWorkspacePackageVersions = async ({ rootDir, version }) => {
  const validatedVersion = assertValidReleaseVersion(version);
  const rootManifestPath = join(rootDir, "package.json");
  const rootManifest = await readJsonFile(rootManifestPath);

  if (rootManifest.version === validatedVersion) {
    throw new Error("Release version must differ from the current version");
  }

  await Promise.all(
    workspacePackageManifestPaths.map(async (relativePath) => {
      const manifestPath = join(rootDir, relativePath);
      const manifest = await readJsonFile(manifestPath);

      manifest.version = validatedVersion;

      await writeJsonFile(manifestPath, manifest);
    }),
  );
};

const main = async () => {
  const version = process.argv[2];

  if (!version) {
    throw new Error("Usage: node scripts/release-version.mjs <version>");
  }

  await syncWorkspacePackageVersions({
    rootDir: process.cwd(),
    version,
  });
};

if (process.argv[1]) {
  const entryUrl = pathToFileURL(process.argv[1]).href;

  if (import.meta.url === entryUrl) {
    await main();
  }
}
