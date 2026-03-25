import type { MetricsDto, ServiceDto } from "@dockeradmin/shared";

import { appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import {
  type ProjectRuntimeServiceLister,
  createDockerProjectRuntimeServiceLister,
} from "../services/runtime.js";
import {
  type ProjectRuntimeMetricsReader,
  createDockerProjectRuntimeMetricsReader,
} from "./runtime.js";

type CreateMetricsServiceOptions = {
  listProjectRuntimeServices?: ProjectRuntimeServiceLister;
  projectRepository: ProjectRepository;
  readProjectRuntimeMetrics?: ProjectRuntimeMetricsReader;
};

export type MetricsService = {
  listProjectMetrics: (input: { projectId: string }) => Promise<MetricsDto[]>;
};

const defaultListProjectRuntimeServices =
  createDockerProjectRuntimeServiceLister();
const defaultReadProjectRuntimeMetrics =
  createDockerProjectRuntimeMetricsReader();

const sortMetricsByServiceName = (metrics: MetricsDto[]): MetricsDto[] => {
  return [...metrics].sort((left, right) => {
    return left.serviceName.localeCompare(right.serviceName, "en");
  });
};

export const createMetricsService = ({
  listProjectRuntimeServices = defaultListProjectRuntimeServices,
  projectRepository,
  readProjectRuntimeMetrics = defaultReadProjectRuntimeMetrics,
}: CreateMetricsServiceOptions): MetricsService => ({
  async listProjectMetrics({ projectId }) {
    const project = await projectRepository.findProjectById(projectId);

    if (!project) {
      throw appErrors.notFound("Project not found");
    }

    const services: ServiceDto[] = await listProjectRuntimeServices({
      projectSlug: project.slug,
    });

    const metrics = await readProjectRuntimeMetrics({
      services,
    });

    return sortMetricsByServiceName(metrics);
  },
});
