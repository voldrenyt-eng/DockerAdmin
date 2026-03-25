import type { DomainCreateRequestDto, DomainDto } from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import {
  type ProjectRuntimeServiceLister,
  createDockerProjectRuntimeServiceLister,
} from "../services/runtime.js";
import type { DomainRecord, DomainRepository } from "./repository.js";
import {
  type TraefikRoutesSyncer,
  createTraefikRoutesSyncer,
} from "./routes.js";

export type DomainService = {
  createDomain: (
    input: DomainCreateRequestDto & {
      userId?: string | null;
    },
  ) => Promise<DomainDto>;
  deleteDomain: (id: string, userId?: string | null) => Promise<void>;
  listDomains: () => Promise<DomainDto[]>;
};

type CreateDomainServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  domainRepository: DomainRepository;
  listProjectRuntimeServices?: ProjectRuntimeServiceLister;
  projectRepository: Pick<ProjectRepository, "findProjectById">;
  syncTraefikRoutes?: TraefikRoutesSyncer;
};

const defaultListProjectRuntimeServices =
  createDockerProjectRuntimeServiceLister();

const toDomainDto = (record: DomainRecord): DomainDto => ({
  host: record.host,
  id: record.id,
  port: record.port,
  projectId: record.projectId,
  serviceName: record.serviceName,
  tlsEnabled: record.tlsEnabled,
});

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
    // Audit persistence must never change the domain outcome.
  }
};

export const createDomainService = ({
  auditLogRepository,
  domainRepository,
  listProjectRuntimeServices = defaultListProjectRuntimeServices,
  projectRepository,
  syncTraefikRoutes = createTraefikRoutesSyncer({
    domainRepository,
  }),
}: CreateDomainServiceOptions): DomainService => ({
  async createDomain(input) {
    const project = await projectRepository.findProjectById(input.projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const existingDomain = await domainRepository.findDomainByHost(input.host);

    if (existingDomain) {
      throw appErrors.conflict("Domain host already exists");
    }

    const services = await listProjectRuntimeServices({
      projectSlug: project.slug,
    });
    const matchedService = services.find((service) => {
      return service.serviceName === input.serviceName;
    });

    if (!matchedService) {
      throw appErrors.notFound("Service not found");
    }

    const record = await domainRepository.createDomain(input);
    await syncTraefikRoutes();

    await writeAuditLogBestEffort({
      auditLogRepository,
      record: {
        action: "DOMAIN_UPSERT",
        entityId: record.id,
        entityType: "domain",
        message: "Domain binding created",
        projectId: record.projectId,
        userId: input.userId ?? null,
      },
    });

    return toDomainDto(record);
  },
  async deleteDomain(id, userId) {
    const deleted = await domainRepository.deleteDomain(id);

    if (!deleted) {
      throw appErrors.notFound("Domain not found");
    }

    await syncTraefikRoutes();

    await writeAuditLogBestEffort({
      auditLogRepository,
      record: {
        action: "DOMAIN_UPSERT",
        entityId: deleted.id,
        entityType: "domain",
        message: "Domain binding deleted",
        projectId: deleted.projectId,
        userId: userId ?? null,
      },
    });
  },
  async listDomains() {
    const records = await domainRepository.listDomains();

    return records.map(toDomainDto);
  },
});
