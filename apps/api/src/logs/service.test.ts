import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../errors.js";
import { createProjectRepository } from "../projects/repository.js";
import { createLogsService, createLogsStreamService } from "./service.js";

test("createLogsService loads the project, verifies the service by project slug, and returns log lines", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T09:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
      },
    ],
  });
  const seenListInputs: Array<{ projectSlug: string }> = [];
  const seenLogInputs: Array<{
    projectSlug: string;
    serviceName: string;
    tail: number;
  }> = [];
  const logsService = createLogsService({
    listProjectRuntimeServices: async (input) => {
      seenListInputs.push(input);

      return [
        {
          containerName: "demo-api-1",
          image: "nginx:1.27",
          ports: ["8080->80/tcp"],
          serviceName: "api",
          startedAt: "2026-03-20T09:00:00.000Z",
          status: "running",
        },
      ];
    },
    projectRepository,
    readProjectRuntimeLogs: async (input) => {
      seenLogInputs.push(input);

      return ["demo-api-1  | ready"];
    },
  });

  const result = await logsService.getProjectLogs({
    projectId: "project_1",
    serviceName: "api",
    tail: 200,
  });

  assert.deepEqual(seenListInputs, [{ projectSlug: "demo-project" }]);
  assert.deepEqual(seenLogInputs, [
    {
      projectSlug: "demo-project",
      serviceName: "api",
      tail: 200,
    },
  ]);
  assert.deepEqual(result, {
    lines: ["demo-api-1  | ready"],
    serviceName: "api",
    tail: 200,
  });
});

test("createLogsService returns a standardized 404 when the project is missing", async () => {
  const logsService = createLogsService({
    listProjectRuntimeServices: async () => {
      return [];
    },
    projectRepository: createProjectRepository(),
    readProjectRuntimeLogs: async () => {
      return [];
    },
  });

  await assert.rejects(
    async () => {
      await logsService.getProjectLogs({
        projectId: "project_missing",
        serviceName: "api",
        tail: 200,
      });
    },
    (error: unknown) => {
      return (
        error instanceof AppError &&
        error.code === "NOT_FOUND" &&
        error.message === "Project not found"
      );
    },
  );
});

test("createLogsService returns a standardized 404 when the service does not belong to the project runtime", async () => {
  const logsService = createLogsService({
    listProjectRuntimeServices: async () => {
      return [
        {
          containerName: "demo-worker-1",
          image: "busybox:1.36",
          ports: [],
          serviceName: "worker",
          startedAt: null,
          status: "stopped",
        },
      ];
    },
    projectRepository: createProjectRepository({
      projects: [
        {
          createdAt: new Date("2026-03-20T09:00:00.000Z"),
          id: "project_1",
          name: "Demo Project",
          slug: "demo-project",
          sourceType: "git",
          updatedAt: new Date("2026-03-20T09:00:00.000Z"),
        },
      ],
    }),
    readProjectRuntimeLogs: async () => {
      return [];
    },
  });

  await assert.rejects(
    async () => {
      await logsService.getProjectLogs({
        projectId: "project_1",
        serviceName: "api",
        tail: 200,
      });
    },
    (error: unknown) => {
      return (
        error instanceof AppError &&
        error.code === "NOT_FOUND" &&
        error.message === "Service not found"
      );
    },
  );
});

test("createLogsStreamService loads the project, verifies the service, snapshots the tail, and starts the live follower", async () => {
  const projectRepository = createProjectRepository({
    projects: [
      {
        createdAt: new Date("2026-03-20T09:00:00.000Z"),
        id: "project_1",
        name: "Demo Project",
        slug: "demo-project",
        sourceType: "git",
        updatedAt: new Date("2026-03-20T09:00:00.000Z"),
      },
    ],
  });
  const seenListInputs: Array<{ projectSlug: string }> = [];
  const seenReadInputs: Array<{
    projectSlug: string;
    serviceName: string;
    tail: number;
  }> = [];
  const seenFollowInputs: Array<{
    onError: (error: Error) => void;
    onLine: (line: string) => void;
    projectSlug: string;
    serviceName: string;
  }> = [];
  const emittedLines: string[] = [];
  const emittedErrors: Error[] = [];
  let stopCallCount = 0;
  const logsStreamService = createLogsStreamService({
    followProjectRuntimeLogs: (input) => {
      seenFollowInputs.push(input);

      return {
        stop() {
          stopCallCount += 1;
        },
      };
    },
    listProjectRuntimeServices: async (input) => {
      seenListInputs.push(input);

      return [
        {
          containerName: "demo-api-1",
          image: "nginx:1.27",
          ports: ["8080->80/tcp"],
          serviceName: "api",
          startedAt: "2026-03-20T09:00:00.000Z",
          status: "running",
        },
      ];
    },
    projectRepository,
    readProjectRuntimeLogs: async (input) => {
      seenReadInputs.push(input);

      return ["demo-api-1  | ready"];
    },
  });

  const session = await logsStreamService.openProjectLogsStream({
    onError: (error) => {
      emittedErrors.push(error);
    },
    onLine: (line) => {
      emittedLines.push(line);
    },
    projectId: "project_1",
    serviceName: "api",
    tail: 50,
  });

  assert.deepEqual(seenListInputs, [{ projectSlug: "demo-project" }]);
  assert.deepEqual(seenReadInputs, [
    {
      projectSlug: "demo-project",
      serviceName: "api",
      tail: 50,
    },
  ]);
  assert.equal(seenFollowInputs.length, 1);
  assert.deepEqual(session.snapshot, {
    lines: ["demo-api-1  | ready"],
    serviceName: "api",
    tail: 50,
  });

  seenFollowInputs[0]?.onLine("demo-api-1  | serving");
  const followError = new Error("Docker logs stream failed");
  seenFollowInputs[0]?.onError(followError);

  assert.deepEqual(emittedLines, ["demo-api-1  | serving"]);
  assert.deepEqual(emittedErrors, [followError]);

  session.stop();

  assert.equal(stopCallCount, 1);
});
