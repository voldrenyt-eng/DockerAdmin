import type { DeploymentDto } from "@dockeradmin/shared";
import type {
  DeploymentSource,
  DeploymentStatus,
  DeploymentTrigger,
  Prisma,
  PrismaClient,
} from "@prisma/client";

export type DeploymentRecord = {
  createdAt: Date;
  finishedAt: Date | null;
  id: string;
  projectId: string;
  source: DeploymentDto["source"];
  startedAt: Date;
  status: DeploymentDto["status"];
  trigger: DeploymentDto["trigger"];
  updatedAt: Date;
};

export type DeploymentRepository = {
  createDeployment: (input: {
    projectId: string;
    source: DeploymentDto["source"];
    status: DeploymentDto["status"];
    trigger: DeploymentDto["trigger"];
  }) => Promise<DeploymentRecord>;
  finishDeployment: (input: {
    finishedAt: Date;
    id: string;
    status: Extract<DeploymentDto["status"], "SUCCESS" | "FAILED">;
  }) => Promise<DeploymentRecord>;
  listDeploymentsByProject: (projectId: string) => Promise<DeploymentRecord[]>;
};

type DeploymentRepositorySeed = {
  deployments?: DeploymentRecord[];
};

const cloneDeployment = (record: DeploymentRecord): DeploymentRecord => ({
  ...record,
  createdAt: new Date(record.createdAt),
  finishedAt: record.finishedAt ? new Date(record.finishedAt) : null,
  startedAt: new Date(record.startedAt),
  updatedAt: new Date(record.updatedAt),
});

const toDeploymentSourceDto = (
  source: DeploymentSource,
): DeploymentDto["source"] => {
  switch (source) {
    case "ZIP":
      return "zip";
    case "GIT":
      return "git";
    default:
      return "manual";
  }
};

const toDeploymentTriggerDto = (
  trigger: DeploymentTrigger,
): DeploymentDto["trigger"] => {
  return trigger === "SYSTEM" ? "system" : "manual";
};

const toPrismaDeploymentSource = (
  source: DeploymentDto["source"],
): DeploymentSource => {
  switch (source) {
    case "zip":
      return "ZIP";
    case "git":
      return "GIT";
    default:
      return "MANUAL";
  }
};

const toPrismaDeploymentTrigger = (
  trigger: DeploymentDto["trigger"],
): DeploymentTrigger => {
  return trigger === "system" ? "SYSTEM" : "MANUAL";
};

const toPrismaDeploymentStatus = (
  status: DeploymentDto["status"],
): DeploymentStatus => {
  return status;
};

const toDeploymentRecord = (
  record: Prisma.DeploymentGetPayload<Record<string, never>>,
): DeploymentRecord => ({
  createdAt: record.createdAt,
  finishedAt: record.finishedAt,
  id: record.id,
  projectId: record.projectId,
  source: toDeploymentSourceDto(record.source),
  startedAt: record.startedAt,
  status: record.status,
  trigger: toDeploymentTriggerDto(record.trigger),
  updatedAt: record.updatedAt,
});

export const createDeploymentRepository = (
  seed: DeploymentRepositorySeed = {},
): DeploymentRepository => {
  const deployments = (seed.deployments ?? []).map(cloneDeployment);
  let sequence = deployments.length + 1;

  return {
    async createDeployment(input) {
      const now = new Date();
      const record = {
        createdAt: now,
        finishedAt: null,
        id: `deployment_${sequence++}`,
        projectId: input.projectId,
        source: input.source,
        startedAt: now,
        status: input.status,
        trigger: input.trigger,
        updatedAt: now,
      } satisfies DeploymentRecord;

      deployments.push(record);

      return cloneDeployment(record);
    },
    async finishDeployment(input) {
      const record = deployments.find((entry) => entry.id === input.id);

      if (!record) {
        throw new Error("Deployment not found");
      }

      record.finishedAt = new Date(input.finishedAt);
      record.status = input.status;
      record.updatedAt = new Date();

      return cloneDeployment(record);
    },
    async listDeploymentsByProject(projectId) {
      return deployments
        .filter((entry) => entry.projectId === projectId)
        .sort((left, right) => {
          return right.startedAt.getTime() - left.startedAt.getTime();
        })
        .map(cloneDeployment);
    },
  };
};

export const createPrismaDeploymentRepository = (
  prisma: PrismaClient,
): DeploymentRepository => ({
  async createDeployment(input) {
    const record = await prisma.deployment.create({
      data: {
        projectId: input.projectId,
        source: toPrismaDeploymentSource(input.source),
        status: toPrismaDeploymentStatus(input.status),
        trigger: toPrismaDeploymentTrigger(input.trigger),
      },
    });

    return toDeploymentRecord(record);
  },
  async finishDeployment(input) {
    const record = await prisma.deployment.update({
      data: {
        finishedAt: input.finishedAt,
        status: toPrismaDeploymentStatus(input.status),
      },
      where: {
        id: input.id,
      },
    });

    return toDeploymentRecord(record);
  },
  async listDeploymentsByProject(projectId) {
    const records = await prisma.deployment.findMany({
      orderBy: {
        startedAt: "desc",
      },
      where: {
        projectId,
      },
    });

    return records.map(toDeploymentRecord);
  },
});
