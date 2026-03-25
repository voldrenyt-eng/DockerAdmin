import assert from "node:assert/strict";
import test from "node:test";

import {
  applyProjectLogsStreamMessage,
  createProjectLogsStreamUrl,
  projectLogsVisibleLineLimit,
} from "./project-logs-stream.js";

test("createProjectLogsStreamUrl converts the API base URL into the guarded websocket endpoint with query params", () => {
  const result = createProjectLogsStreamUrl({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    projectId: "project_1",
    serviceName: "api",
    tail: 200,
  });

  assert.equal(
    result,
    "ws://localhost:3001/api/ws/logs?projectId=project_1&serviceName=api&tail=200&accessToken=token_1",
  );
});

test("applyProjectLogsStreamMessage replaces lines on snapshot and appends later line frames within the visible limit", () => {
  const snapshot = applyProjectLogsStreamMessage({
    currentLines: ["stale line"],
    message: {
      lines: ["ready", "warming"],
      serviceName: "api",
      tail: 50,
      type: "snapshot",
    },
  });

  assert.deepEqual(snapshot, {
    error: null,
    lines: ["ready", "warming"],
  });

  const appended = applyProjectLogsStreamMessage({
    currentLines: Array.from(
      { length: projectLogsVisibleLineLimit },
      (_, index) => `line ${index + 1}`,
    ),
    message: {
      line: "line newest",
      serviceName: "api",
      type: "line",
    },
  });

  assert.equal(appended.error, null);
  assert.equal(appended.lines.length, projectLogsVisibleLineLimit);
  assert.equal(appended.lines[0], "line 2");
  assert.equal(appended.lines.at(-1), "line newest");
});

test("applyProjectLogsStreamMessage surfaces safe websocket error frames without discarding buffered logs", () => {
  const result = applyProjectLogsStreamMessage({
    currentLines: ["api ready"],
    message: {
      message: "Log stream overloaded",
      type: "error",
    },
  });

  assert.deepEqual(result, {
    error: "Log stream overloaded",
    lines: ["api ready"],
  });
});
