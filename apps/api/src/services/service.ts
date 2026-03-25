import type { ServiceActionDto, ServiceDto } from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import { createServiceId, parseServiceId } from "./identity.js";
import {
  type ProjectRuntimeServiceActionRunner,
  type ProjectRuntimeServiceLister,
  createDockerProjectRuntimeServiceActionRunner,
  createDockerProjectRuntimeServiceLister,
} from "./runtime.js";

type CreateServiceServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  listProjectRuntimeServices?: ProjectRuntimeServiceLister;
  projectRepository: ProjectRepository;
  runProjectServiceAction?: ProjectRuntimeServiceActionRunner;
};

export type ServiceService = {
  listProjectServices: (input: { projectId: string }) => Promise<ServiceDto[]>;
  performServiceAction: (input: {
    action: ServiceActionDto;
    serviceId: string;
    userId: string | null;
  }) => Promise<ServiceDto>;
  resolveServiceActionTarget: (input: {
    serviceId: string;
  }) => Promise<{
    projectId: string;
    projectSlug: string;
    serviceId: string;
    serviceName: string;
  }>;
};

const defaultListProjectRuntimeServices =
  createDockerProjectRuntimeServiceLister();
const defaultRunProjectServiceAction =
  createDockerProjectRuntimeServiceActionRunner();

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
    // Audit persistence must never change the service action outcome.
  }
};

const withServiceId = (input: {
  projectId: string;
  service: ServiceDto;
}): ServiceDto => {
  return {
    ...input.service,
    serviceId: createServiceId({
      projectId: input.projectId,
      serviceName: input.service.serviceName,
    }),
  };
};

export const createServiceService = ({
  auditLogRepository,
  listProjectRuntimeServices = defaultListProjectRuntimeServices,
  projectRepository,
  runProjectServiceAction = defaultRunProjectServiceAction,
}: CreateServiceServiceOptions): ServiceService => ({
  async listProjectServices({ projectId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const services = await listProjectRuntimeServices({
      projectSlug: project.slug,
    });

    return services.map((service) => {
      return withServiceId({
        projectId,
        service,
      });
    });
  },
  async performServiceAction({ action, serviceId, userId }) {
    const target = await this.resolveServiceActionTarget({
      serviceId,
    });

    try {
      await runProjectServiceAction({
        action,
        projectSlug: target.projectSlug,
        serviceName: target.serviceName,
      });
      const services = await listProjectRuntimeServices({
        projectSlug: target.projectSlug,
      });
      const refreshedService = services.find((service) => {
        return service.serviceName === target.serviceName;
      });

      if (!refreshedService) {
        throw new Error("Service action result lookup failed");
      }

      await writeAuditLogBestEffort({
        auditLogRepository,
        record: {
          action: "SERVICE_ACTION",
          entityId: serviceId,
          entityType: "service",
          message: `Service ${action} completed successfully`,
          projectId: target.projectId,
          userId,
        },
      });

      return withServiceId({
        projectId: target.projectId,
        service: refreshedService,
      });
    } catch (error) {
      await writeAuditLogBestEffort({
        auditLogRepository,
        record: {
          action: "SERVICE_ACTION",
          entityId: serviceId,
          entityType: "service",
          message: `Service ${action} failed`,
          projectId: target.projectId,
          userId,
        },
      });

      throw new Error("Docker service action failed");
    }
  },
  async resolveServiceActionTarget({ serviceId }) {
    const identity = parseServiceId(serviceId);

    if (!identity) {
      throw appErrors.notFound("Service not found");
    }

    const project = await projectRepository.findProjectById(identity.projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const services = await listProjectRuntimeServices({
      projectSlug: project.slug,
    });
    const matchedService = services.find((service) => {
      return service.serviceName === identity.serviceName;
    });

    if (!matchedService) {
      throw appErrors.notFound("Service not found");
    }

    return {
      projectId: project.id,
      projectSlug: project.slug,
      serviceId,
      serviceName: matchedService.serviceName,
    };
  },
});
