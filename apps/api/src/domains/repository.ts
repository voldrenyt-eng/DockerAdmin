import type { Prisma, PrismaClient } from "@prisma/client";

export type DomainRecord = {
  createdAt: Date;
  host: string;
  id: string;
  port: number;
  projectId: string;
  serviceName: string;
  tlsEnabled: boolean;
  updatedAt: Date;
};

export type DomainRepository = {
  createDomain: (input: {
    host: string;
    port: number;
    projectId: string;
    serviceName: string;
    tlsEnabled: boolean;
  }) => Promise<DomainRecord>;
  deleteDomain: (id: string) => Promise<DomainRecord | null>;
  findDomainByHost: (host: string) => Promise<DomainRecord | null>;
  listDomains: () => Promise<DomainRecord[]>;
};

type DomainRepositorySeed = {
  domains?: DomainRecord[];
};

const cloneDomain = (record: DomainRecord): DomainRecord => ({
  ...record,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const toDomainRecord = (
  record: Prisma.DomainGetPayload<Record<string, never>>,
): DomainRecord => ({
  createdAt: record.createdAt,
  host: record.host,
  id: record.id,
  port: record.port,
  projectId: record.projectId,
  serviceName: record.serviceName,
  tlsEnabled: record.tlsEnabled,
  updatedAt: record.updatedAt,
});

export const createDomainRepository = (
  seed: DomainRepositorySeed = {},
): DomainRepository => {
  const domains = (seed.domains ?? []).map(cloneDomain);
  let sequence = domains.length + 1;

  return {
    async createDomain(input) {
      const now = new Date();
      const record = {
        createdAt: now,
        host: input.host,
        id: `domain_${sequence++}`,
        port: input.port,
        projectId: input.projectId,
        serviceName: input.serviceName,
        tlsEnabled: input.tlsEnabled,
        updatedAt: now,
      } satisfies DomainRecord;

      domains.push(record);

      return cloneDomain(record);
    },
    async deleteDomain(id) {
      const index = domains.findIndex((entry) => entry.id === id);

      if (index < 0) {
        return null;
      }

      const [deletedRecord] = domains.splice(index, 1);

      return deletedRecord ? cloneDomain(deletedRecord) : null;
    },
    async findDomainByHost(host) {
      const domain = domains.find((entry) => entry.host === host);

      return domain ? cloneDomain(domain) : null;
    },
    async listDomains() {
      return domains
        .slice()
        .sort((left, right) => {
          return left.createdAt.getTime() - right.createdAt.getTime();
        })
        .map(cloneDomain);
    },
  };
};

export const createPrismaDomainRepository = (
  prisma: PrismaClient,
): DomainRepository => ({
  async createDomain(input) {
    const record = await prisma.domain.create({
      data: {
        host: input.host,
        port: input.port,
        projectId: input.projectId,
        serviceName: input.serviceName,
        tlsEnabled: input.tlsEnabled,
      },
    });

    return toDomainRecord(record);
  },
  async deleteDomain(id) {
    const existingRecord = await prisma.domain.findUnique({
      where: {
        id,
      },
    });

    if (!existingRecord) {
      return null;
    }

    await prisma.domain.delete({
      where: {
        id,
      },
    });

    return toDomainRecord(existingRecord);
  },
  async findDomainByHost(host) {
    const record = await prisma.domain.findUnique({
      where: {
        host,
      },
    });

    return record ? toDomainRecord(record) : null;
  },
  async listDomains() {
    const records = await prisma.domain.findMany({
      orderBy: {
        createdAt: "asc",
      },
    });

    return records.map(toDomainRecord);
  },
});
