import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthSchema, ProjectSchema } from "@dockeradmin/shared";

import { createAuditLogCapture } from "../audit/test-utils.js";
import { hashPassword } from "../auth/password.js";
import { createAuthRepository } from "../auth/repository.js";
import { createAuthService } from "../auth/service.js";
import { appErrors } from "../errors.js";
import { createProjectRepository } from "../projects/repository.js";
import { createProjectService } from "../projects/service.js";
import { createRuntimePaths } from "../runtime/paths.js";
import { buildApp } from "../server.js";
import { createSourceService } from "./service.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

type GitCloneRunnerInput = {
  branch?: string | undefined;
  destinationDir: string;
  timeoutMs: number;
  url: string;
};

const createGitSourceTestContext = async (options?: {
  runGitClone?: (input: GitCloneRunnerInput) => Promise<void>;
  sourceService?: unknown;
}) => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-git-source-"));
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
  const sourceService =
    options?.sourceService ??
    createSourceService({
      auditLogRepository: auditLogCapture.auditLogRepository,
      projectRepository,
      ...(options?.runGitClone ? { runGitClone: options.runGitClone } : {}),
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
    projectRepository,
    runtimePaths,
  };
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createGitSourceTestContext>>["app"],
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

const createGitProject = async (
  app: Awaited<ReturnType<typeof createGitSourceTestContext>>["app"],
  accessToken: string,
) => {
  const response = await app.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Git Project",
      sourceType: "git",
    },
    url: "/api/projects",
  });

  assert.equal(response.statusCode, 201);

  return ProjectSchema.parse(response.json());
};

test("POST /api/projects/:id/source/git returns a standardized 401 when access token is missing", async () => {
  const context = await createGitSourceTestContext({
    sourceService: {
      cloneGitSource: async () => {},
      maxUploadBytes: 10 * 1024 * 1024,
      uploadZipSource: async () => {},
    },
  });

  try {
    const response = await context.app.inject({
      method: "POST",
      payload: {
        branch: "main",
        url: "https://github.com/octocat/Hello-World.git",
      },
      url: "/api/projects/project_1/source/git",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/git clones a public repository into the project repo workspace", async () => {
  let capturedInput:
    | {
        branch?: string;
        projectId: string;
        url: string;
      }
    | undefined;
  const context = await createGitSourceTestContext({
    sourceService: {
      cloneGitSource: async (input: {
        branch?: string;
        projectId: string;
        url: string;
      }) => {
        capturedInput = input;
        const repoDir = context.runtimePaths.getProjectRepoDir(input.projectId);

        writeFileSync(join(repoDir, "README.md"), "# cloned\n", "utf8");
      },
      maxUploadBytes: 10 * 1024 * 1024,
      uploadZipSource: async () => {},
    },
  });

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createGitProject(context.app, accessToken);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        branch: "  main  ",
        url: "https://github.com/octocat/Hello-World.git",
      },
      url: `/api/projects/${project.id}/source/git`,
    });

    assert.equal(response.statusCode, 204);
    assert.deepEqual(capturedInput, {
      branch: "main",
      projectId: project.id,
      url: "https://github.com/octocat/Hello-World.git",
      userId: "user_admin",
    });
    assert.equal(
      readFileSync(
        join(context.dataRoot, "projects", project.id, "repo", "README.md"),
        "utf8",
      ),
      "# cloned\n",
    );
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/git writes a safe SOURCE_CLONE audit record", async () => {
  const context = await createGitSourceTestContext({
    runGitClone: async (input: GitCloneRunnerInput) => {
      writeFileSync(
        join(input.destinationDir, "README.md"),
        "# cloned\n",
        "utf8",
      );
    },
  });

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createGitProject(context.app, accessToken);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        branch: "main",
        url: "https://github.com/octocat/Hello-World.git",
      },
      url: `/api/projects/${project.id}/source/git`,
    });

    assert.equal(response.statusCode, 204);
    assert.deepEqual(context.auditLogCapture.listAuditLogs(), [
      {
        action: "SOURCE_CLONE",
        entityId: project.id,
        entityType: "project",
        message: "Git source cloned",
        projectId: project.id,
        userId: "user_admin",
      },
    ]);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("POST /api/projects/:id/source/git rejects a non-https repository URL with a standardized 422", async () => {
  let cloneCalls = 0;
  const context = await createGitSourceTestContext({
    sourceService: {
      cloneGitSource: async () => {
        cloneCalls += 1;
      },
      maxUploadBytes: 10 * 1024 * 1024,
      uploadZipSource: async () => {},
    },
  });

  try {
    const accessToken = await loginAsAdmin(context.app);
    const project = await createGitProject(context.app, accessToken);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        url: "http://github.com/octocat/Hello-World.git",
      },
      url: `/api/projects/${project.id}/source/git`,
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request payload does not match the shared DTO contract",
      },
    });
    assert.equal(cloneCalls, 0);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("createSourceService.cloneGitSource clones into repo and preserves branch/url input for the runner", async () => {
  let capturedCloneRequest:
    | {
        branch?: string | undefined;
        destinationDir: string;
        timeoutMs: number;
        url: string;
      }
    | undefined;
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-git-service-"));
  const projectRepository = createProjectRepository();
  const runtimePaths = createRuntimePaths({ dataRoot });
  const sourceService = createSourceService({
    projectRepository,
    runGitClone: async (input: GitCloneRunnerInput) => {
      capturedCloneRequest = input;
      writeFileSync(
        join(input.destinationDir, "README.md"),
        "# repo\n",
        "utf8",
      );
    },
    runtimePaths,
  } as never) as never as {
    cloneGitSource: (input: {
      branch?: string | undefined;
      projectId: string;
      url: string;
    }) => Promise<void>;
  };

  try {
    const project = await projectRepository.createProject({
      name: "Git Project",
      slug: "git-project",
      sourceType: "git",
    });

    await sourceService.cloneGitSource({
      branch: "main",
      projectId: project.id,
      url: "https://github.com/octocat/Hello-World.git",
    });

    assert.equal(
      readFileSync(
        join(dataRoot, "projects", project.id, "repo", "README.md"),
        "utf8",
      ),
      "# repo\n",
    );
    assert.equal(capturedCloneRequest?.branch, "main");
    assert.equal(
      capturedCloneRequest?.url,
      "https://github.com/octocat/Hello-World.git",
    );
    assert.ok(capturedCloneRequest?.destinationDir.includes(project.id));
    assert.equal(typeof capturedCloneRequest?.timeoutMs, "number");
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("createSourceService.cloneGitSource atomically replaces the existing repo workspace on repeated clone", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-git-service-"));
  const projectRepository = createProjectRepository();
  const runtimePaths = createRuntimePaths({ dataRoot });
  const sourceService = createSourceService({
    projectRepository,
    runGitClone: async (input: GitCloneRunnerInput) => {
      if (input.url.endsWith("first.git")) {
        writeFileSync(
          join(input.destinationDir, "README.md"),
          "# first repo\n",
          "utf8",
        );
        writeFileSync(
          join(input.destinationDir, "legacy.txt"),
          "legacy\n",
          "utf8",
        );
        return;
      }

      writeFileSync(
        join(input.destinationDir, "README.md"),
        "# second repo\n",
        "utf8",
      );
    },
    runtimePaths,
  } as never) as never as {
    cloneGitSource: (input: {
      projectId: string;
      url: string;
    }) => Promise<void>;
  };

  try {
    const project = await projectRepository.createProject({
      name: "Git Project",
      slug: "git-project",
      sourceType: "git",
    });

    await sourceService.cloneGitSource({
      projectId: project.id,
      url: "https://github.com/example/first.git",
    });
    await sourceService.cloneGitSource({
      projectId: project.id,
      url: "https://github.com/example/second.git",
    });

    assert.equal(
      readFileSync(
        join(dataRoot, "projects", project.id, "repo", "README.md"),
        "utf8",
      ),
      "# second repo\n",
    );
    assert.equal(
      existsSync(join(dataRoot, "projects", project.id, "repo", "legacy.txt")),
      false,
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("createSourceService.cloneGitSource keeps the previous repo workspace when replacement clone fails", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-git-service-"));
  const projectRepository = createProjectRepository();
  const runtimePaths = createRuntimePaths({ dataRoot });
  const sourceService = createSourceService({
    projectRepository,
    runGitClone: async (input: GitCloneRunnerInput) => {
      if (input.url.endsWith("first.git")) {
        writeFileSync(
          join(input.destinationDir, "README.md"),
          "# stable repo\n",
          "utf8",
        );
        return;
      }

      writeFileSync(
        join(input.destinationDir, "README.md"),
        "# partial\n",
        "utf8",
      );
      throw appErrors.validation("Git clone failed: repository not found");
    },
    runtimePaths,
  } as never) as never as {
    cloneGitSource: (input: {
      projectId: string;
      url: string;
    }) => Promise<void>;
  };

  try {
    const project = await projectRepository.createProject({
      name: "Git Project",
      slug: "git-project",
      sourceType: "git",
    });

    await sourceService.cloneGitSource({
      projectId: project.id,
      url: "https://github.com/example/first.git",
    });
    await assert.rejects(
      () =>
        sourceService.cloneGitSource({
          projectId: project.id,
          url: "https://github.com/example/second.git",
        }),
      {
        code: "VALIDATION_ERROR",
        message: "Git clone failed: repository not found",
      },
    );
    assert.equal(
      readFileSync(
        join(dataRoot, "projects", project.id, "repo", "README.md"),
        "utf8",
      ),
      "# stable repo\n",
    );
    assert.equal(
      existsSync(join(dataRoot, "projects", project.id, "repo", "partial.txt")),
      false,
    );
    assert.equal(
      readdirSync(join(dataRoot, "projects", project.id)).some((entry) =>
        entry.startsWith(".repo-"),
      ),
      false,
    );
  } finally {
    rmSync(dataRoot, { force: true, recursive: true });
  }
});
