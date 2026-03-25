import assert from "node:assert/strict";
import test from "node:test";

import type { DeploymentDto } from "@dockeradmin/shared";

import {
  getLatestProjectDeployment,
  getRecentProjectDeployments,
  hasRunningProjectDeployment,
  projectDeploymentHistoryLimit,
} from "./project-deployments.js";

const createDeploymentFixture = (
  overrides: Partial<DeploymentDto> = {},
): DeploymentDto => ({
  finishedAt: "2026-03-23T09:00:00.000Z",
  id: "deploy_1",
  source: "git",
  startedAt: "2026-03-23T08:58:00.000Z",
  status: "SUCCESS",
  trigger: "manual",
  ...overrides,
});

test("getRecentProjectDeployments trims deployment history to the configured limit", () => {
  const deployments = Array.from(
    { length: projectDeploymentHistoryLimit + 2 },
    (_, index) =>
      createDeploymentFixture({
        id: `deploy_${index + 1}`,
        startedAt: `2026-03-23T09:${String(index).padStart(2, "0")}:00.000Z`,
      }),
  );

  const result = getRecentProjectDeployments(deployments);

  assert.equal(result.length, projectDeploymentHistoryLimit);
  assert.deepEqual(
    result.map((deployment) => deployment.id),
    ["deploy_1", "deploy_2", "deploy_3", "deploy_4", "deploy_5"],
  );
});

test("getLatestProjectDeployment returns the first deployment or null for an empty history", () => {
  assert.equal(getLatestProjectDeployment([]), null);
  assert.deepEqual(getLatestProjectDeployment([createDeploymentFixture()]), {
    finishedAt: "2026-03-23T09:00:00.000Z",
    id: "deploy_1",
    source: "git",
    startedAt: "2026-03-23T08:58:00.000Z",
    status: "SUCCESS",
    trigger: "manual",
  });
});

test("hasRunningProjectDeployment only reports true when the latest deployment is running", () => {
  assert.equal(
    hasRunningProjectDeployment([
      createDeploymentFixture({ status: "RUNNING" }),
      createDeploymentFixture({ id: "deploy_2", status: "FAILED" }),
    ]),
    true,
  );
  assert.equal(
    hasRunningProjectDeployment([
      createDeploymentFixture({ status: "SUCCESS" }),
      createDeploymentFixture({ id: "deploy_2", status: "RUNNING" }),
    ]),
    false,
  );
  assert.equal(hasRunningProjectDeployment([]), false);
});
