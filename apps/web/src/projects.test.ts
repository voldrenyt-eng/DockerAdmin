import assert from "node:assert/strict";
import test from "node:test";

import type { DomainDto, ProjectDto, ServiceDto } from "@dockeradmin/shared";

import {
  createDomain,
  createProject,
  deleteDomain,
  deployProject,
  getProject,
  getProjectEnv,
  getProjectLogs,
  listDomains,
  listProjectDeployments,
  listProjectServices,
  listProjects,
  performServiceAction,
  putProjectEnv,
  uploadProjectGitSource,
  uploadProjectZipSource,
} from "./projects.js";

const createProjectFixture = (
  overrides: Partial<ProjectDto> = {},
): ProjectDto => ({
  id: "project_1",
  name: "Demo Project",
  slug: "demo-project",
  sourceType: "zip",
  ...overrides,
});

const createServiceFixture = (
  overrides: Partial<ServiceDto> = {},
): ServiceDto => ({
  containerName: "demo-project-api-1",
  image: "ghcr.io/example/api:latest",
  ports: ["8080:8080"],
  serviceId: "service_api",
  serviceName: "api",
  startedAt: "2026-03-23T09:58:00.000Z",
  status: "running",
  ...overrides,
});

const createDomainFixture = (
  overrides: Partial<DomainDto> = {},
): DomainDto => ({
  host: "demo.example.com",
  id: "domain_1",
  port: 8080,
  projectId: "project_1",
  serviceName: "api",
  tlsEnabled: true,
  ...overrides,
});

test("listProjects calls the guarded projects endpoint and parses the shared project list response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await listProjects({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          projects: [createProjectFixture()],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/projects",
    },
  ]);
  assert.deepEqual(result, [createProjectFixture()]);
});

test("createProject posts project metadata and parses the created project", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  const result = await createProject({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(JSON.stringify(createProjectFixture()), {
        headers: {
          "content-type": "application/json",
        },
        status: 201,
      });
    },
    name: "Demo Project",
    sourceType: "zip",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "zip",
      },
      url: "http://localhost:3001/api/projects",
    },
  ]);
  assert.deepEqual(result, createProjectFixture());
});

test("getProject calls the guarded project detail endpoint and parses the shared project response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await getProject({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(JSON.stringify(createProjectFixture()), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/projects/project_1",
    },
  ]);
  assert.deepEqual(result, createProjectFixture());
});

test("getProjectEnv calls the guarded env endpoint and parses the shared env response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await getProjectEnv({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          content: "NODE_ENV=production\nAPI_BASE_URL=https://example.com",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/projects/project_1/env",
    },
  ]);
  assert.equal(result, "NODE_ENV=production\nAPI_BASE_URL=https://example.com");
});

test("getProjectEnv returns null when the backend reports that env is not set yet", async () => {
  const result = await getProjectEnv({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "Project env file not found",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 404,
        },
      );
    },
    projectId: "project_1",
  });

  assert.equal(result, null);
});

test("putProjectEnv posts the guarded env payload to the env endpoint", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  const result = await putProjectEnv({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    content: "DATABASE_URL=postgres://runtime\nJWT_SECRET=secret",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(null, {
        status: 204,
      });
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "PUT",
      payload: {
        content: "DATABASE_URL=postgres://runtime\nJWT_SECRET=secret",
      },
      url: "http://localhost:3001/api/projects/project_1/env",
    },
  ]);
  assert.equal(result, undefined);
});

test("listProjectDeployments calls the guarded deployments endpoint and parses the shared deployment list response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await listProjectDeployments({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(
        JSON.stringify([
          {
            finishedAt: "2026-03-23T09:47:00.000Z",
            id: "deploy_2",
            source: "git",
            startedAt: "2026-03-23T09:45:00.000Z",
            status: "SUCCESS",
            trigger: "manual",
          },
          {
            finishedAt: null,
            id: "deploy_1",
            source: "zip",
            startedAt: "2026-03-23T09:40:00.000Z",
            status: "RUNNING",
            trigger: "system",
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/projects/project_1/deployments",
    },
  ]);
  assert.deepEqual(result, [
    {
      finishedAt: "2026-03-23T09:47:00.000Z",
      id: "deploy_2",
      source: "git",
      startedAt: "2026-03-23T09:45:00.000Z",
      status: "SUCCESS",
      trigger: "manual",
    },
    {
      finishedAt: null,
      id: "deploy_1",
      source: "zip",
      startedAt: "2026-03-23T09:40:00.000Z",
      status: "RUNNING",
      trigger: "system",
    },
  ]);
});

test("deployProject posts to the guarded deploy endpoint and parses the shared deployment response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await deployProject({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          finishedAt: "2026-03-23T09:52:00.000Z",
          id: "deploy_3",
          source: "git",
          startedAt: "2026-03-23T09:50:00.000Z",
          status: "FAILED",
          trigger: "manual",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "POST",
      url: "http://localhost:3001/api/projects/project_1/deploy",
    },
  ]);
  assert.deepEqual(result, {
    finishedAt: "2026-03-23T09:52:00.000Z",
    id: "deploy_3",
    source: "git",
    startedAt: "2026-03-23T09:50:00.000Z",
    status: "FAILED",
    trigger: "manual",
  });
});

test("listProjectServices calls the guarded services endpoint and parses the shared service list response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await listProjectServices({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(JSON.stringify([createServiceFixture()]), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/projects/project_1/services",
    },
  ]);
  assert.deepEqual(result, [createServiceFixture()]);
});

test("performServiceAction posts the requested action to the guarded service endpoint and parses the updated service", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  const result = await performServiceAction({
    accessToken: "token_1",
    action: "restart",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(
        JSON.stringify(
          createServiceFixture({
            startedAt: "2026-03-23T10:05:00.000Z",
            status: "starting",
          }),
        ),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    serviceId: "service_api",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "POST",
      payload: {
        action: "restart",
      },
      url: "http://localhost:3001/api/services/service_api/action",
    },
  ]);
  assert.deepEqual(
    result,
    createServiceFixture({
      startedAt: "2026-03-23T10:05:00.000Z",
      status: "starting",
    }),
  );
});

test("getProjectLogs calls the guarded logs endpoint with query params and parses the shared logs response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await getProjectLogs({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          lines: ["demo-project-api-1  | ready", "demo-project-api-1  | live"],
          serviceName: "api",
          tail: 200,
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    projectId: "project_1",
    serviceName: "api",
    tail: 200,
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/projects/project_1/logs?serviceName=api&tail=200",
    },
  ]);
  assert.deepEqual(result, {
    lines: ["demo-project-api-1  | ready", "demo-project-api-1  | live"],
    serviceName: "api",
    tail: 200,
  });
});

test("listDomains calls the guarded domains endpoint and parses the shared domains response", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await listDomains({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(JSON.stringify([createDomainFixture()]), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "GET",
      url: "http://localhost:3001/api/domains",
    },
  ]);
  assert.deepEqual(result, [createDomainFixture()]);
});

test("createDomain posts the guarded domain payload and parses the created domain binding", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  const result = await createDomain({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(JSON.stringify(createDomainFixture()), {
        headers: {
          "content-type": "application/json",
        },
        status: 201,
      });
    },
    host: "demo.example.com",
    port: 8080,
    projectId: "project_1",
    serviceName: "api",
    tlsEnabled: true,
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "POST",
      payload: {
        host: "demo.example.com",
        port: 8080,
        projectId: "project_1",
        serviceName: "api",
        tlsEnabled: true,
      },
      url: "http://localhost:3001/api/domains",
    },
  ]);
  assert.deepEqual(result, createDomainFixture());
});

test("deleteDomain calls the guarded delete endpoint for an existing domain binding", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    url: string;
  }> = [];

  const result = await deleteDomain({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    domainId: "domain_1",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(null, {
        status: 204,
      });
    },
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "DELETE",
      url: "http://localhost:3001/api/domains/domain_1",
    },
  ]);
  assert.equal(result, undefined);
});

test("uploadProjectZipSource posts a binary ZIP body to the guarded source endpoint", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    bodyByteLength: number;
    contentType: string | null;
    method: string;
    url: string;
  }> = [];

  await uploadProjectZipSource({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    archive: new Blob([Uint8Array.from([80, 75, 3, 4])], {
      type: "application/zip",
    }),
    fetchImpl: async (input, init) => {
      const body = init?.body as ArrayBuffer | undefined;

      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        bodyByteLength: body ? body.byteLength : 0,
        contentType: new Headers(init?.headers).get("content-type"),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(null, {
        status: 204,
      });
    },
    projectId: "project_1",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      bodyByteLength: 4,
      contentType: "application/zip",
      method: "POST",
      url: "http://localhost:3001/api/projects/project_1/source/zip",
    },
  ]);
});

test("uploadProjectGitSource posts the repository URL and optional branch to the guarded source endpoint", async () => {
  const seenRequests: Array<{
    authorizationHeader: string | null;
    method: string;
    payload: unknown;
    url: string;
  }> = [];

  await uploadProjectGitSource({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    branch: "main",
    fetchImpl: async (input, init) => {
      seenRequests.push({
        authorizationHeader: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        payload: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });

      return new Response(null, {
        status: 204,
      });
    },
    projectId: "project_1",
    url: "https://github.com/example/repo.git",
  });

  assert.deepEqual(seenRequests, [
    {
      authorizationHeader: "Bearer token_1",
      method: "POST",
      payload: {
        branch: "main",
        url: "https://github.com/example/repo.git",
      },
      url: "http://localhost:3001/api/projects/project_1/source/git",
    },
  ]);
});

test("listProjects retries once with a refreshed access token after a 401 response", async () => {
  const seenAuthorizationHeaders: string[] = [];
  let refreshCalls = 0;

  const result = await listProjects({
    accessToken: "token_1",
    apiBaseUrl: "http://localhost:3001",
    fetchImpl: async (_input, init) => {
      const authorizationHeader =
        new Headers(init?.headers).get("authorization") ?? "";

      seenAuthorizationHeaders.push(authorizationHeader);

      if (authorizationHeader === "Bearer token_1") {
        return new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired access token",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 401,
          },
        );
      }

      return new Response(
        JSON.stringify({
          projects: [createProjectFixture()],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      );
    },
    onAccessTokenExpired: async () => {
      refreshCalls += 1;

      return "token_2";
    },
  });

  assert.equal(refreshCalls, 1);
  assert.deepEqual(seenAuthorizationHeaders, [
    "Bearer token_1",
    "Bearer token_2",
  ]);
  assert.deepEqual(result, [createProjectFixture()]);
});
