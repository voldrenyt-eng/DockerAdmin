import type {
  ProjectCreateRequestDto,
  ProjectDto,
  ProjectSourceTypeDto,
} from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { appErrors } from "../errors.js";
import type { RuntimePaths } from "../runtime/paths.js";
import type { ProjectRecord, ProjectRepository } from "./repository.js";
import { generateUniqueProjectSlug } from "./slug.js";

export type ProjectService = {
  createProject: (
    input: ProjectCreateRequestDto & {
      userId?: string | null;
    },
  ) => Promise<ProjectDto>;
  getProjectById: (id: string) => Promise<ProjectDto>;
  listProjects: () => Promise<ProjectDto[]>;
  updateProjectName: (input: {
    id: string;
    name: string;
    userId?: string | null;
  }) => Promise<ProjectDto>;
};

type CreateProjectServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  projectRepository: ProjectRepository;
  runtimePaths?: Pick<RuntimePaths, "ensureProjectRuntimeLayout">;
};

const toProjectDto = (record: ProjectRecord): ProjectDto => ({
  id: record.id,
  name: record.name,
  slug: record.slug,
  sourceType: record.sourceType,
});

const normalizeSourceType = (
  sourceType: ProjectSourceTypeDto,
): ProjectSourceTypeDto => sourceType;

const writeAuditLogBestEffort = async (input: {
  auditLogRepository: AuditLogRepository | undefined;
  record: Parameters<AuditLogRepository["createAuditLog"]>[0];
}): Promise<void> => {
  if (!input.auditLogRepository) {
    return;
  }

  try {
    await input.auditLogRepository.createAuditLog(input.record);
  } catch {
    // Audit persistence must never change the project outcome.
  }
};

export const createProjectService = ({
  auditLogRepository,
  projectRepository,
  runtimePaths,
}: CreateProjectServiceOptions): ProjectService => ({
  async createProject(input) {
    const slug = await generateUniqueProjectSlug(input.name, async (value) => {
      const existingProject = await projectRepository.findProjectBySlug(value);

      return existingProject !== null;
    });
    const record = await projectRepository.createProject({
      name: input.name,
      slug,
      sourceType: normalizeSourceType(input.sourceType),
    });

    if (runtimePaths) {
      await runtimePaths.ensureProjectRuntimeLayout(record.id);
    }

    await writeAuditLogBestEffort({
      auditLogRepository,
      record: {
        action: "PROJECT_CREATE",
        entityId: record.id,
        entityType: "project",
        message: "Project created",
        projectId: record.id,
        userId: input.userId ?? null,
      },
    });

    return toProjectDto(record);
  },
  async getProjectById(id) {
    const record = await projectRepository.findProjectById(id);

    if (!record) {
      throw appErrors.notFound("Project not found");
    }

    return toProjectDto(record);
  },
  async listProjects() {
    const records = await projectRepository.listProjects();

    return records.map(toProjectDto);
  },
  async updateProjectName(input) {
    const record = await projectRepository.updateProjectName({
      id: input.id,
      name: input.name,
    });

    if (!record) {
      throw appErrors.notFound("Project not found");
    }

    await writeAuditLogBestEffort({
      auditLogRepository,
      record: {
        action: "PROJECT_UPDATE",
        entityId: record.id,
        entityType: "project",
        message: "Project updated",
        projectId: record.id,
        userId: input.userId ?? null,
      },
    });

    return toProjectDto(record);
  },
});
