import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectDetailPath,
  defaultProjectDetailTab,
  resolveProjectDetailTab,
} from "./project-detail-routing.js";

test("resolveProjectDetailTab accepts supported tabs and falls back to services", () => {
  assert.equal(defaultProjectDetailTab, "services");
  assert.equal(resolveProjectDetailTab("services"), "services");
  assert.equal(resolveProjectDetailTab("logs"), "logs");
  assert.equal(resolveProjectDetailTab("domains"), "domains");
  assert.equal(resolveProjectDetailTab("deployments"), "deployments");
  assert.equal(resolveProjectDetailTab("env"), "env");
  assert.equal(resolveProjectDetailTab("unknown"), "services");
  assert.equal(resolveProjectDetailTab(undefined), "services");
});

test("createProjectDetailPath builds nested project detail URLs with the default tab", () => {
  assert.equal(
    createProjectDetailPath("project_1"),
    "/projects/project_1/services",
  );
  assert.equal(
    createProjectDetailPath("project_1", "deployments"),
    "/projects/project_1/deployments",
  );
});
