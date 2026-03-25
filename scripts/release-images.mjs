import { pathToFileURL } from "node:url";

import { assertValidReleaseVersion } from "./release-version.mjs";

const normalizeOwner = (owner) => {
  const normalizedOwner = owner.trim().toLowerCase();

  if (!normalizedOwner) {
    throw new Error("Repository owner is required");
  }

  return normalizedOwner;
};

export const buildReleaseImageRefs = ({ owner, version }) => {
  const normalizedOwner = normalizeOwner(owner);
  const normalizedVersion = assertValidReleaseVersion(version);
  const versionTag = `v${normalizedVersion}`;

  return {
    apiImage: `ghcr.io/${normalizedOwner}/dockeradmin-api:${versionTag}`,
    webImage: `ghcr.io/${normalizedOwner}/dockeradmin-web:${versionTag}`,
    versionTag,
  };
};

const main = async () => {
  const owner = process.argv[2];
  const version = process.argv[3];

  if (!owner || !version) {
    throw new Error("Usage: node scripts/release-images.mjs <owner> <version>");
  }

  const imageRefs = buildReleaseImageRefs({ owner, version });

  console.log(`api_image=${imageRefs.apiImage}`);
  console.log(`web_image=${imageRefs.webImage}`);
  console.log(`version_tag=${imageRefs.versionTag}`);
};

if (process.argv[1]) {
  const entryUrl = pathToFileURL(process.argv[1]).href;

  if (import.meta.url === entryUrl) {
    await main();
  }
}
