import type { ProjectSourceTypeDto } from "@dockeradmin/shared";
import {
  type Prisma,
  type PrismaClient,
  ProjectSourceType,
} from "@prisma/client";

export type ProjectRecord = {
  createdAt: Date;
  id: string;
  name: string;
  slug: string;
  sourceType: ProjectSourceTypeDto;
  updatedAt: Date;
};

export type ProjectRepository = {
  createProject: (input: {
    name: string;
    slug: string;
    sourceType: ProjectSourceTypeDto;
  }) => Promise<ProjectRecord>;
  findProjectById: (id: string) => Promise<ProjectRecord | null>;
  findProjectBySlug: (slug: string) => Promise<ProjectRecord | null>;
  listProjects: () => Promise<ProjectRecord[]>;
  updateProjectName: (input: {
    id: string;
    name: string;
  }) => Promise<ProjectRecord | null>;
};

type ProjectRepositorySeed = {
  projects?: ProjectRecord[];
};

const cloneProject = (record: ProjectRecord): ProjectRecord => ({
  ...record,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const toProjectSourceTypeDto = (
  sourceType: ProjectSourceType,
): ProjectSourceTypeDto =>
  sourceType === ProjectSourceType.GIT ? "git" : "zip";

const toPrismaProjectSourceType = (
  sourceType: ProjectSourceTypeDto,
): ProjectSourceType =>
  sourceType === "git" ? ProjectSourceType.GIT : ProjectSourceType.ZIP;

const toProjectRecord = (
  record: Prisma.ProjectGetPayload<Record<string, never>>,
): ProjectRecord => ({
  createdAt: record.createdAt,
  id: record.id,
  name: record.name,
  slug: record.slug,
  sourceType: toProjectSourceTypeDto(record.sourceType),
  updatedAt: record.updatedAt,
});

export const createProjectRepository = (
  seed: ProjectRepositorySeed = {},
): ProjectRepository => {
  const projects = (seed.projects ?? []).map(cloneProject);
  let sequence = projects.length + 1;

  return {
    async createProject(input) {
      const now = new Date();
      const project = {
        createdAt: now,
        id: `project_${sequence++}`,
        name: input.name,
        slug: input.slug,
        sourceType: input.sourceType,
        updatedAt: now,
      } satisfies ProjectRecord;

      projects.push(project);

      return cloneProject(project);
    },
    async findProjectById(id) {
      const project = projects.find((entry) => entry.id === id);

      return project ? cloneProject(project) : null;
    },
    async findProjectBySlug(slug) {
      const project = projects.find((entry) => entry.slug === slug);

      return project ? cloneProject(project) : null;
    },
    async listProjects() {
      return projects.map(cloneProject);
    },
    async updateProjectName(input) {
      const project = projects.find((entry) => entry.id === input.id);

      if (!project) {
        return null;
      }

      project.name = input.name;
      project.updatedAt = new Date();

      return cloneProject(project);
    },
  };
};

export const createPrismaProjectRepository = (
  prisma: PrismaClient,
): ProjectRepository => ({
  async createProject(input) {
    const record = await prisma.project.create({
      data: {
        name: input.name,
        slug: input.slug,
        sourceType: toPrismaProjectSourceType(input.sourceType),
      },
    });

    return toProjectRecord(record);
  },
  async findProjectById(id) {
    const record = await prisma.project.findUnique({
      where: {
        id,
      },
    });

    return record ? toProjectRecord(record) : null;
  },
  async findProjectBySlug(slug) {
    const record = await prisma.project.findUnique({
      where: {
        slug,
      },
    });

    return record ? toProjectRecord(record) : null;
  },
  async listProjects() {
    const records = await prisma.project.findMany({
      orderBy: {
        createdAt: "asc",
      },
    });

    return records.map(toProjectRecord);
  },
  async updateProjectName(input) {
    const record = await prisma.project.findUnique({
      where: {
        id: input.id,
      },
    });

    if (!record) {
      return null;
    }

    const updatedRecord = await prisma.project.update({
      data: {
        name: input.name,
      },
      where: {
        id: input.id,
      },
    });

    return toProjectRecord(updatedRecord);
  },
});
