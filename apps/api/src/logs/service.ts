import type { ProjectLogsResponseDto } from "@dockeradmin/shared";

import { appErrors } from "../errors.js";
import type { ProjectRepository } from "../projects/repository.js";
import {
  type ProjectRuntimeServiceLister,
  createDockerProjectRuntimeServiceLister,
} from "../services/runtime.js";
import {
  type ProjectRuntimeLogsFollowSession,
  type ProjectRuntimeLogsFollower,
  type ProjectRuntimeLogsReader,
  createDockerProjectRuntimeLogsFollower,
  createDockerProjectRuntimeLogsReader,
} from "./runtime.js";

type CreateLogsServiceOptions = {
  listProjectRuntimeServices?: ProjectRuntimeServiceLister;
  projectRepository: ProjectRepository;
  readProjectRuntimeLogs?: ProjectRuntimeLogsReader;
};

type CreateLogsStreamServiceOptions = {
  followProjectRuntimeLogs?: ProjectRuntimeLogsFollower;
  listProjectRuntimeServices?: ProjectRuntimeServiceLister;
  projectRepository: ProjectRepository;
  readProjectRuntimeLogs?: ProjectRuntimeLogsReader;
};

export type LogsService = {
  getProjectLogs: (input: {
    projectId: string;
    serviceName: string;
    tail: number;
  }) => Promise<ProjectLogsResponseDto>;
};

export type LogsStreamSession = {
  snapshot: ProjectLogsResponseDto;
  stop: () => void;
};

export type LogsStreamService = {
  openProjectLogsStream: (input: {
    onError: (error: Error) => void;
    onLine: (line: string) => void;
    projectId: string;
    serviceName: string;
    tail: number;
  }) => Promise<LogsStreamSession>;
};

const defaultListProjectRuntimeServices =
  createDockerProjectRuntimeServiceLister();
const defaultFollowProjectRuntimeLogs =
  createDockerProjectRuntimeLogsFollower();
const defaultReadProjectRuntimeLogs = createDockerProjectRuntimeLogsReader();

const resolveProjectRuntimeLogTarget = async (input: {
  listProjectRuntimeServices: ProjectRuntimeServiceLister;
  projectId: string;
  projectRepository: ProjectRepository;
  serviceName: string;
}): Promise<{
  projectSlug: string;
}> => {
  const project = await input.projectRepository.findProjectById(
    input.projectId,
  );

  if (!project) {
    throw appErrors.notFound("Project not found");
  }

  const services = await input.listProjectRuntimeServices({
    projectSlug: project.slug,
  });
  const matchedService = services.find((service) => {
    return service.serviceName === input.serviceName;
  });

  if (!matchedService) {
    throw appErrors.notFound("Service not found");
  }

  return {
    projectSlug: project.slug,
  };
};

export const createLogsService = ({
  listProjectRuntimeServices = defaultListProjectRuntimeServices,
  projectRepository,
  readProjectRuntimeLogs = defaultReadProjectRuntimeLogs,
}: CreateLogsServiceOptions): LogsService => ({
  async getProjectLogs({ projectId, serviceName, tail }) {
    const target = await resolveProjectRuntimeLogTarget({
      listProjectRuntimeServices,
      projectId,
      projectRepository,
      serviceName,
    });

    const lines = await readProjectRuntimeLogs({
      projectSlug: target.projectSlug,
      serviceName,
      tail,
    });

    return {
      lines,
      serviceName,
      tail,
    };
  },
});

export const createLogsStreamService = ({
  followProjectRuntimeLogs = defaultFollowProjectRuntimeLogs,
  listProjectRuntimeServices = defaultListProjectRuntimeServices,
  projectRepository,
  readProjectRuntimeLogs = defaultReadProjectRuntimeLogs,
}: CreateLogsStreamServiceOptions): LogsStreamService => ({
  async openProjectLogsStream({
    onError,
    onLine,
    projectId,
    serviceName,
    tail,
  }) {
    const target = await resolveProjectRuntimeLogTarget({
      listProjectRuntimeServices,
      projectId,
      projectRepository,
      serviceName,
    });
    const lines = await readProjectRuntimeLogs({
      projectSlug: target.projectSlug,
      serviceName,
      tail,
    });
    const followSession: ProjectRuntimeLogsFollowSession =
      followProjectRuntimeLogs({
        onError,
        onLine,
        projectSlug: target.projectSlug,
        serviceName,
      });

    return {
      snapshot: {
        lines,
        serviceName,
        tail,
      },
      stop() {
        followSession.stop();
      },
    };
  },
});
