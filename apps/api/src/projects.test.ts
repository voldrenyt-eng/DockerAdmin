import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AuthSchema,
  type ProjectDto,
  ProjectSchema,
  type ProjectSourceTypeDto,
} from "@dockeradmin/shared";

import { createAuditLogCapture } from "./audit/test-utils.js";
import { hashPassword } from "./auth/password.js";
import { createAuthRepository } from "./auth/repository.js";
import { createAuthService } from "./auth/service.js";
import { appErrors } from "./errors.js";
import { buildApp } from "./server.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "AdminPass123!";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createProjectServiceDouble = () => {
  const projects = new Map<string, ProjectDto>();
  let sequence = 1;

  return {
    async createProject(input: {
      name: string;
      sourceType: ProjectSourceTypeDto;
    }): Promise<ProjectDto> {
      const id = `project_${sequence++}`;
      const slugBase = slugify(input.name);
      const project = {
        id,
        name: input.name,
        slug: slugBase || id,
        sourceType: input.sourceType,
      } satisfies ProjectDto;

      projects.set(project.id, project);

      return project;
    },
    async getProjectById(id: string): Promise<ProjectDto> {
      const project = projects.get(id);

      if (!project) {
        throw appErrors.notFound("Project not found");
      }

      return project;
    },
    async listProjects(): Promise<ProjectDto[]> {
      return Array.from(projects.values());
    },
    async updateProjectName(input: {
      id: string;
      name: string;
    }): Promise<ProjectDto> {
      const project = projects.get(input.id);

      if (!project) {
        throw appErrors.notFound("Project not found");
      }

      const nextProject = {
        ...project,
        name: input.name,
      } satisfies ProjectDto;

      projects.set(input.id, nextProject);

      return nextProject;
    },
  };
};

const createTestApp = async () => {
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
  const projectService = createProjectServiceDouble();

  return buildApp({ authService, projectService } as never);
};

const createAuditedProjectTestContext = async () => {
  const { createProjectRepository } = await import("./projects/repository.js");
  const { createProjectService } = await import("./projects/service.js");
  const { createRuntimePaths } = await import("./runtime/paths.js");
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-project-audit-"));
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
  const auditLogCapture = createAuditLogCapture();
  const projectService = createProjectService({
    auditLogRepository: auditLogCapture.auditLogRepository,
    projectRepository: createProjectRepository(),
    runtimePaths: createRuntimePaths({ dataRoot }),
  });
  const app = buildApp({ authService, projectService } as never);

  return {
    app,
    auditLogCapture,
    dataRoot,
  };
};

const loginAsAdmin = async (
  app: Awaited<ReturnType<typeof createTestApp>>,
): Promise<string> => {
  const response = await app.inject({
    method: "POST",
    payload: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
    url: "/api/auth/login",
  });

  const body = AuthSchema.parse(response.json());

  return body.tokens.accessToken;
};

test("POST /api/projects returns a standardized 401 when access token is missing", async () => {
  const app = await createTestApp();

  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/projects creates project metadata for an authenticated admin", async () => {
  const app = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "  Demo Project  ",
        sourceType: "git",
      },
      url: "/api/projects",
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(ProjectSchema.parse(response.json()), {
      id: "project_1",
      name: "Demo Project",
      slug: "demo-project",
      sourceType: "git",
    });
  } finally {
    await app.close();
  }
});

test("POST /api/projects writes a safe PROJECT_CREATE audit record for an authenticated admin", async () => {
  const context = await createAuditedProjectTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });
    const project = ProjectSchema.parse(response.json());

    assert.equal(response.statusCode, 201);
    assert.deepEqual(context.auditLogCapture.listAuditLogs(), [
      {
        action: "PROJECT_CREATE",
        entityId: project.id,
        entityType: "project",
        message: "Project created",
        projectId: project.id,
        userId: "user_admin",
      },
    ]);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("GET /api/projects returns created project metadata for an authenticated admin", async () => {
  const app = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);

    await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      projects: [
        {
          id: "project_1",
          name: "Demo Project",
          slug: "demo-project",
          sourceType: "git",
        },
      ],
    });
  } finally {
    await app.close();
  }
});

test("GET /api/projects/:id returns project metadata or a standardized 404", async () => {
  const app = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const createResponse = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });
    const createdProject = ProjectSchema.parse(createResponse.json());

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: `/api/projects/${createdProject.id}`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(ProjectSchema.parse(response.json()), createdProject);

    const missingResponse = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      url: "/api/projects/project_missing",
    });

    assert.equal(missingResponse.statusCode, 404);
    assert.deepEqual(missingResponse.json(), {
      error: {
        code: "NOT_FOUND",
        message: "Project not found",
      },
    });
  } finally {
    await app.close();
  }
});

test("PATCH /api/projects/:id writes a safe PROJECT_UPDATE audit record for an authenticated admin", async () => {
  const context = await createAuditedProjectTestContext();

  try {
    const accessToken = await loginAsAdmin(context.app);
    const createResponse = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });
    const project = ProjectSchema.parse(createResponse.json());

    context.auditLogCapture.clearAuditLogs();

    const response = await context.app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "PATCH",
      payload: {
        name: "Renamed Project",
      },
      url: `/api/projects/${project.id}`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(context.auditLogCapture.listAuditLogs(), [
      {
        action: "PROJECT_UPDATE",
        entityId: project.id,
        entityType: "project",
        message: "Project updated",
        projectId: project.id,
        userId: "user_admin",
      },
    ]);
  } finally {
    await context.app.close();
    rmSync(context.dataRoot, { force: true, recursive: true });
  }
});

test("PATCH /api/projects/:id updates the name and keeps the slug stable", async () => {
  const app = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const createResponse = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });
    const createdProject = ProjectSchema.parse(createResponse.json());

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "PATCH",
      payload: {
        name: "  Renamed Project  ",
      },
      url: `/api/projects/${createdProject.id}`,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(ProjectSchema.parse(response.json()), {
      ...createdProject,
      name: "Renamed Project",
    });
  } finally {
    await app.close();
  }
});

test("POST /api/projects returns a standardized 422 for invalid project name", async () => {
  const app = await createTestApp();

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "ab",
        sourceType: "git",
      },
      url: "/api/projects",
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json(), {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request payload does not match the shared DTO contract",
      },
    });
  } finally {
    await app.close();
  }
});

test("POST /api/projects creates the runtime directory layout under the configured data root", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "dockeradmin-runtime-"));
  const { createProjectRepository } = await import("./projects/repository.js");
  const { createProjectService } = await import("./projects/service.js");
  const { createRuntimePaths } = await import("./runtime/paths.js");
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
  const projectService = createProjectService({
    projectRepository: createProjectRepository(),
    runtimePaths: createRuntimePaths({ dataRoot }),
  });
  const app = buildApp({ authService, projectService } as never);

  try {
    const accessToken = await loginAsAdmin(app);
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "POST",
      payload: {
        name: "Demo Project",
        sourceType: "git",
      },
      url: "/api/projects",
    });
    const project = ProjectSchema.parse(response.json());
    const projectRoot = join(dataRoot, "projects", project.id);

    assert.equal(response.statusCode, 201);
    assert.ok(existsSync(projectRoot));
    assert.ok(existsSync(join(projectRoot, "src")));
    assert.ok(existsSync(join(projectRoot, "repo")));
    assert.ok(existsSync(join(projectRoot, "deploy")));
  } finally {
    await app.close();
    rmSync(dataRoot, { force: true, recursive: true });
  }
});

test("createProjectService generates a numeric suffix for slug collisions", async () => {
  const { createProjectRepository } = await import("./projects/repository.js");
  const { createProjectService } = await import("./projects/service.js");

  const projectService = createProjectService({
    projectRepository: createProjectRepository(),
  });

  const firstProject = await projectService.createProject({
    name: "Demo Project",
    sourceType: "git",
  });
  const secondProject = await projectService.createProject({
    name: "Demo Project",
    sourceType: "zip",
  });

  assert.equal(firstProject.slug, "demo-project");
  assert.equal(secondProject.slug, "demo-project-2");
});

test("createProjectService keeps slug stable after project rename", async () => {
  const { createProjectRepository } = await import("./projects/repository.js");
  const { createProjectService } = await import("./projects/service.js");

  const projectService = createProjectService({
    projectRepository: createProjectRepository(),
  });

  const createdProject = await projectService.createProject({
    name: "Demo Project",
    sourceType: "git",
  });
  const updatedProject = await projectService.updateProjectName({
    id: createdProject.id,
    name: "Renamed Project",
  });

  assert.equal(updatedProject.slug, createdProject.slug);
  assert.equal(updatedProject.name, "Renamed Project");
});
