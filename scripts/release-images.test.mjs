import assert from "node:assert/strict";
import test from "node:test";

test("buildReleaseImageRefs lowercases the owner and returns canonical GHCR tags for api and web", async () => {
  const { buildReleaseImageRefs } = await import("./release-images.mjs");

  assert.deepEqual(
    buildReleaseImageRefs({
      owner: "DockerAdminOrg",
      version: "0.2.0",
    }),
    {
      apiImage: "ghcr.io/dockeradminorg/dockeradmin-api:v0.2.0",
      webImage: "ghcr.io/dockeradminorg/dockeradmin-web:v0.2.0",
      versionTag: "v0.2.0",
    },
  );
});

test("buildReleaseImageRefs rejects empty owners and invalid release versions", async () => {
  const { buildReleaseImageRefs } = await import("./release-images.mjs");

  assert.throws(
    () =>
      buildReleaseImageRefs({
        owner: "",
        version: "0.2.0",
      }),
    /owner/i,
  );
  assert.throws(
    () =>
      buildReleaseImageRefs({
        owner: "DockerAdminOrg",
        version: "latest",
      }),
    /strict semver/i,
  );
});
