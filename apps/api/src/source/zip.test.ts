import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthSchema, ProjectSchema } from "@dockeradmin/shared";
import { ZipFile } from "yazl";

import { createAuditLogCapture } from "../audit/test-utils.js";
import { hashPassword } from "../auth/password.js";
import { createAuthRepository } from "../auth/repository.js";
import { createAuthService } from "../auth/service.js";
import { createProjectRepository } from "../projects/repository.js";
import { createProjectService } from "../projects/service.js";
import { createRuntimePaths } from "../runtime/paths.js";
import { buildApp } from "../server.js";
import { createSourceService } from "./service.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const createZipBuffer = async (
  entries: Array<{
    content?: Buffer | string;
    isDirectory?: boolean;
    mode?: number;
    path: string;
  }>,
): Promise<Buffer> => {
  return await new Promise((resolve, reject) => {
    const zipFile = new ZipFile();
    const chunks: Buffer[] = [];

    zipFile.outputStream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    zipFile.outputStream.on("error", reject);
    zipFile.outputStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    for (const entry of entries) {
      if (entry.isDirectory) {
        zipFile.addEmptyDirectory(
          entry.path,
          entry.mode === undefined ? undefined : { mode: entry.mode },
        );
        continue;
      }

      zipFile.addBuffer(
        Buffer.isBuffer(entry.content)
          ? entry.content
          : Buffer.from(entry.content ?? ""),
        entry.path,
        entry.mode === undefined ? undefined : { mode: entry.mode },
      );
    }

    zipFile.end();
  });
};

const replaceBufferBytes = (
  input: Buffer,
  from: string,
  to: string,
): Buffer => {
  const fromBuffer = Buffer.from(from);
  const toBuffer = Buffer.from(to);

  assert.equal(fromBuffer.length, toBuffer.length);

  const output = Buffer.from(input);
  let offset = 0;

  while (offset <= output.length - fromBuffer.length) {
    const matchIndex = output.indexOf(fromBuffer, offset);

    if (matchIndex === -1) {
      break;
    }

    toBuffer.copy(output, matchIndex);
    offset = matchIndex + fromBuffer.length;
  }

  return output;
};

const createSourceTestContext = async (options?: {
  maxExtractedBytes?: number;
  maxUploadBytes?: number;
}) => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-source-"));
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const authRepository = createAuthRepository({
    refreshTokens: [],
    users: [
      {
        email: ADMIN_EMAIL,
        id: "user_admin",
        passwordHash,
        role: "ADMIN",
      },
    ],
  });
  const authService = createAuthService({
    authRepository,
    jwtAccessSecret: "test-access-secret",
    jwtRefreshSecret: "test-refresh-secret",
  });
  const projectRepository = createProjectRepository();
  const runtimePaths = createRuntimePaths({ dataRoot });
  const projectService = createProjectService({
    projectRepository,
    runtimePaths,
  });
  const auditLogCapture = createAuditLogCapture();
  const sourceService = createSourceService({
    auditLogRepository: auditLogCapture.auditLogRepository,
    ...(options?.maxExtractedBytes === undefined
      ? {}
      : { maxExtractedBytes: options.maxExtractedBytes }),
    ...(options?.maxUploadBytes === undefined
      ? {}
      : { maxUploadBytes: options.maxUploadBytes }),
    projectRepository,
    runtimePaths,
  });
  const app = buildApp({
    authService,
    projectService,
    sourceService,
  } as never);

  return {
    app,
    auditLogCapture,
    dataRoot,
  };
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createSourceTestContext>>["app"],
): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    payload: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    url: "/api/auth/login",
  });

  return AuthSchema.parse(response.json()).tokens.accessToken;
};

const createZipProject = async (
  app: Awaited<ReturnType<typeof createSourceTestContext>>["app"],
  accessToken: string,
) => {
  const response = await app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "ZIP Project",
      sourceType: "zip",
    },
    url: "/api/projects",
  });

  assert.equal(response.statusCode, 201);

  return ProjectSchema.parse(response.json());
};

test("POST /api/projects/:id/source/zip extracts safe ZIP contents into the project src workspace", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const archive = await createZipBuffer([
      {
        content: "services:\n  app:\n    image: nginx:1.27-alpine\n",
        path: "docker-compose.yml",
      },
      {
        content: "console.log('hello from zip');\n",
        path: "app/index.js",
      },
    ]);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 204);
    assert.equal(
      readFileSync(
        join(
          context.dataRoot,
          "projects",
          project.id,
          "src",
          "docker-compose.yml",
        ),
        "utf8",
      ),
      "services:\n  app:\n    image: nginx:1.27-alpine\n",
    );
    assert.equal(
      readFileSync(
        join(
          context.dataRoot,
          "projects",
          project.id,
          "src",
          "app",
          "index.js",
        ),
        "utf8",
      ),
      "console.log('hello from zip');\n",
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip writes a safe SOURCE_UPLOAD audit record", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const archive = await createZipBuffer([
      {
        content: "services:\n  app:\n    image: nginx:1.27-alpine\n",
        path: "docker-compose.yml",
      },
    ]);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 204);
    assert.deepEqual(context.auditLogCapture.listAuditLogs(), [
      {
        action: "SOURCE_UPLOAD",
        entityId: project.id,
        entityType: "project",
        message: "ZIP source uploaded",
        projectId: project.id,
        userId: "user_admin",
      },
    ]);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip returns a standardized 404 when the project is missing", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const archive = await createZipBuffer([
      {
        content: "version: '3.9'\n",
        path: "docker-compose.yml",
      },
    ]);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: "/api/projects/project_missing/source/zip",
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Project not found",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip atomically replaces the existing src workspace on repeated upload", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const firstArchive = await createZipBuffer([
      {
        content: "FROM node:24-alpine\n",
        path: "Dockerfile",
      },
      {
        content: "legacy artifact\n",
        path: "legacy.txt",
      },
    ]);
    const secondArchive = await createZipBuffer([
      {
        content: "services:\n  app:\n    image: nginx:1.27-alpine\n",
        path: "docker-compose.yml",
      },
      {
        content: "console.log('replaced');\n",
        path: "src/index.js",
      },
    ]);

    const firstResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: firstArchive,
      url: `/api/projects/${project.id}/source/zip`,
    });
    const secondResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: secondArchive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(firstResponse.statusCode, 204);
    assert.equal(secondResponse.statusCode, 204);
    assert.equal(
      existsSync(
        join(context.dataRoot, "projects", project.id, "src", "Dockerfile"),
      ),
      false,
    );
    assert.equal(
      existsSync(
        join(context.dataRoot, "projects", project.id, "src", "legacy.txt"),
      ),
      false,
    );
    assert.equal(
      readFileSync(
        join(
          context.dataRoot,
          "projects",
          project.id,
          "src",
          "docker-compose.yml",
        ),
        "utf8",
      ),
      "services:\n  app:\n    image: nginx:1.27-alpine\n",
    );
    assert.equal(
      readFileSync(
        join(
          context.dataRoot,
          "projects",
          project.id,
          "src",
          "src",
          "index.js",
        ),
        "utf8",
      ),
      "console.log('replaced');\n",
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip keeps the previous src workspace when replacement extract fails", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const firstArchive = await createZipBuffer([
      {
        content: "FROM node:24-alpine\n",
        path: "Dockerfile",
      },
    ]);
    const secondArchive = replaceBufferBytes(
      await createZipBuffer([
        {
          content: "owned\n",
          path: "aa/escape.txt",
        },
      ]),
      "aa/escape.txt",
      "../escape.txt",
    );

    const firstResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: firstArchive,
      url: `/api/projects/${project.id}/source/zip`,
    });
    const secondResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: secondArchive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(firstResponse.statusCode, 204);
    assert.equal(secondResponse.statusCode, 422);
    assert.deepEqual(secondResponse.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "ZIP archive contains an unsafe path",
      },
    });
    assert.equal(
      readFileSync(
        join(context.dataRoot, "projects", project.id, "src", "Dockerfile"),
        "utf8",
      ),
      "FROM node:24-alpine\n",
    );
    assert.equal(
      existsSync(join(context.dataRoot, "projects", project.id, "escape.txt")),
      false,
    );
    assert.equal(
      readdirSync(join(context.dataRoot, "projects", project.id)).some(
        (entry) => entry.startsWith(".src-"),
      ),
      false,
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip rejects path traversal entries with a readable 422", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const archive = replaceBufferBytes(
      await createZipBuffer([
        {
          content: "owned\n",
          path: "aa/escape.txt",
        },
      ]),
      "aa/escape.txt",
      "../escape.txt",
    );
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "ZIP archive contains an unsafe path",
      },
    });
    assert.equal(
      existsSync(join(context.dataRoot, "projects", project.id, "escape.txt")),
      false,
    );
    assert.deepEqual(
      readdirSync(join(context.dataRoot, "projects", project.id, "src")),
      [],
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip rejects symlink entries with a readable 422", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const archive = await createZipBuffer([
      {
        content: "target.txt",
        mode: 0o120777,
        path: "linked-file",
      },
    ]);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "ZIP archive contains a blocked file type",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip rejects special files with a readable 422", async () => {
  const context = await createSourceTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const archive = await createZipBuffer([
      {
        content: "special",
        mode: 0o020666,
        path: "device-file",
      },
    ]);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "ZIP archive contains a blocked file type",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip rejects archives that exceed the extracted size limit", async () => {
  const context = await createSourceTestContext({
    maxExtractedBytes: 32,
  });

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const archive = await createZipBuffer([
      {
        content: "x".repeat(64),
        path: "big.txt",
      },
    ]);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: archive,
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "ZIP archive exceeds the maximum extracted size",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/zip rejects archives that exceed the upload size limit", async () => {
  const context = await createSourceTestContext({
    maxUploadBytes: 128,
  });

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createZipProject(context.app, accessToken);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/zip",
      },
      method: "POST",
      payload: randomBytes(256),
      url: `/api/projects/${project.id}/source/zip`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "ZIP archive exceeds the maximum upload size",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});
