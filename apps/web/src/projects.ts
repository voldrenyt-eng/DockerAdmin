import {
  DeploymentListSchema,
  DeploymentSchema,
  DomainCreateRequestSchema,
  DomainListSchema,
  DomainSchema,
  ProjectCreateRequestSchema,
  ProjectEnvResponseSchema,
  ProjectEnvUpsertRequestSchema,
  ProjectListResponseSchema,
  ProjectLogsResponseSchema,
  ProjectSchema,
  ProjectSourceGitRequestSchema,
  ServiceActionRequestSchema,
  ServiceSchema,
  parseApiError,
} from "@dockeradmin/shared";

const defaultFetchImpl = (...args: Parameters<typeof fetch>) => {
  return fetch(...args);
};

const projectEnvNotFoundMessage = "Project env file not found";

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const createProjectsApiUrl = (input: {
  apiBaseUrl: string;
  path:
    | "/api/domains"
    | "/api/projects"
    | `/api/domains/${string}`
    | `/api/projects/${string}`
    | `/api/projects/${string}/deploy`
    | `/api/projects/${string}/deployments`
    | `/api/projects/${string}/env`
    | `/api/projects/${string}/logs`
    | `/api/projects/${string}/services`
    | `/api/projects/${string}/source/git`
    | `/api/projects/${string}/source/zip`
    | `/api/services/${string}/action`;
}): string => {
  return new URL(input.path, input.apiBaseUrl).toString();
};

const performAuthorizedRequest = async (input: {
  accessToken: string;
  execute: (accessToken: string) => Promise<Response>;
  onAccessTokenExpired?: () => Promise<string | null>;
}): Promise<Response> => {
  let response = await input.execute(input.accessToken);

  if (response.status === 401 && input.onAccessTokenExpired) {
    const refreshedAccessToken = await input.onAccessTokenExpired();

    if (refreshedAccessToken) {
      response = await input.execute(refreshedAccessToken);
    }
  }

  return response;
};

const ensureSuccessfulResponse = async (input: {
  fallbackErrorMessage: string;
  response: Response;
}): Promise<unknown> => {
  const body = await safeParseJson(input.response);

  if (!input.response.ok) {
    const apiError = parseApiError(body);

    throw new Error(apiError?.error.message ?? input.fallbackErrorMessage);
  }

  return body;
};

export const listProjects = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/projects",
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/projects",
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load projects",
    response,
  });

  try {
    return ProjectListResponseSchema.parse(body).projects;
  } catch {
    throw new Error("Projects response does not match the shared DTO contract");
  }
};

export const createProject = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  name: string;
  onAccessTokenExpired?: () => Promise<string | null>;
  sourceType: "zip" | "git";
}) => {
  const payload = ProjectCreateRequestSchema.parse({
    name: input.name,
    sourceType: input.sourceType,
  });
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/projects",
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/projects",
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Project creation failed",
    response,
  });

  try {
    return ProjectSchema.parse(body);
  } catch {
    throw new Error("Project response does not match the shared DTO contract");
  }
};

export const getProject = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load project",
    response,
  });

  try {
    return ProjectSchema.parse(body);
  } catch {
    throw new Error("Project response does not match the shared DTO contract");
  }
};

export const getProjectEnv = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/env`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/env`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );

  if (response.status === 404) {
    const body = await safeParseJson(response);
    const apiError = parseApiError(body);

    if (apiError?.error.message === projectEnvNotFoundMessage) {
      return null;
    }

    throw new Error(apiError?.error.message ?? "Failed to load project env");
  }

  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load project env",
    response,
  });

  try {
    return ProjectEnvResponseSchema.parse(body).content;
  } catch {
    throw new Error(
      "Project env response does not match the shared DTO contract",
    );
  }
};

export const listProjectDeployments = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/deployments`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/deployments`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load project deployments",
    response,
  });

  try {
    return DeploymentListSchema.parse(body);
  } catch {
    throw new Error(
      "Project deployments response does not match the shared DTO contract",
    );
  }
};

export const deployProject = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/deploy`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "POST",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/deploy`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "POST",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to trigger project deploy",
    response,
  });

  try {
    return DeploymentSchema.parse(body);
  } catch {
    throw new Error(
      "Project deploy response does not match the shared DTO contract",
    );
  }
};

export const listProjectServices = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/services`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/services`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load project services",
    response,
  });

  try {
    return ServiceSchema.array().parse(body);
  } catch {
    throw new Error(
      "Project services response does not match the shared DTO contract",
    );
  }
};

export const performServiceAction = async (input: {
  accessToken: string;
  action: "start" | "stop" | "restart";
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  serviceId: string;
}) => {
  const payload = ServiceActionRequestSchema.parse({
    action: input.action,
  });
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/services/${input.serviceId}/action`,
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/services/${input.serviceId}/action`,
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to update project service",
    response,
  });

  try {
    return ServiceSchema.parse(body);
  } catch {
    throw new Error(
      "Project service action response does not match the shared DTO contract",
    );
  }
};

export const getProjectLogs = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
  serviceName: string;
  tail: number;
}) => {
  const requestUrl = new URL(
    createProjectsApiUrl({
      apiBaseUrl: input.apiBaseUrl,
      path: `/api/projects/${input.projectId}/logs`,
    }),
  );
  requestUrl.searchParams.set("serviceName", input.serviceName);
  requestUrl.searchParams.set("tail", String(input.tail));

  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              requestUrl.toString(),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              requestUrl.toString(),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load project logs",
    response,
  });

  try {
    return ProjectLogsResponseSchema.parse(body);
  } catch {
    throw new Error(
      "Project logs response does not match the shared DTO contract",
    );
  }
};

export const listDomains = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/domains",
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/domains",
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "GET",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to load domains",
    response,
  });

  try {
    return DomainListSchema.parse(body);
  } catch {
    throw new Error("Domains response does not match the shared DTO contract");
  }
};

export const createDomain = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  host: string;
  onAccessTokenExpired?: () => Promise<string | null>;
  port: number;
  projectId: string;
  serviceName: string;
  tlsEnabled: boolean;
}) => {
  const payload = DomainCreateRequestSchema.parse({
    host: input.host,
    port: input.port,
    projectId: input.projectId,
    serviceName: input.serviceName,
    tlsEnabled: input.tlsEnabled,
  });
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/domains",
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: "/api/domains",
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
        },
  );
  const body = await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to create domain",
    response,
  });

  try {
    return DomainSchema.parse(body);
  } catch {
    throw new Error(
      "Domain create response does not match the shared DTO contract",
    );
  }
};

export const deleteDomain = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  domainId: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/domains/${input.domainId}`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "DELETE",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/domains/${input.domainId}`,
              }),
              {
                headers: {
                  authorization: `Bearer ${accessToken}`,
                },
                method: "DELETE",
              },
            );
          },
        },
  );

  await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to delete domain",
    response,
  });
};

export const putProjectEnv = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  content: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const payload = ProjectEnvUpsertRequestSchema.parse({
    content: input.content,
  });
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/env`,
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "PUT",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/env`,
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "PUT",
              },
            );
          },
        },
  );

  await ensureSuccessfulResponse({
    fallbackErrorMessage: "Failed to save project env",
    response,
  });
};

export const uploadProjectZipSource = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  archive: Blob;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
}) => {
  const archiveBuffer = await input.archive.arrayBuffer();
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/source/zip`,
              }),
              {
                body: archiveBuffer,
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": input.archive.type || "application/zip",
                },
                method: "POST",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/source/zip`,
              }),
              {
                body: archiveBuffer,
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": input.archive.type || "application/zip",
                },
                method: "POST",
              },
            );
          },
        },
  );

  await ensureSuccessfulResponse({
    fallbackErrorMessage: "ZIP upload failed",
    response,
  });
};

export const uploadProjectGitSource = async (input: {
  accessToken: string;
  apiBaseUrl: string;
  branch?: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  projectId: string;
  url: string;
}) => {
  const payload = ProjectSourceGitRequestSchema.parse({
    branch: input.branch,
    url: input.url,
  });
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/source/git`,
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
          onAccessTokenExpired: input.onAccessTokenExpired,
        }
      : {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createProjectsApiUrl({
                apiBaseUrl: input.apiBaseUrl,
                path: `/api/projects/${input.projectId}/source/git`,
              }),
              {
                body: JSON.stringify(payload),
                headers: {
                  authorization: `Bearer ${accessToken}`,
                  "content-type": "application/json",
                },
                method: "POST",
              },
            );
          },
        },
  );

  await ensureSuccessfulResponse({
    fallbackErrorMessage: "Git source setup failed",
    response,
  });
};
