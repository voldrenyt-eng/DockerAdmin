import { AuditLogListResponseSchema, parseApiError } from "@dockeradmin/shared";

const defaultFetchImpl = (...args: Parameters<typeof fetch>) => {
  return fetch(...args);
};

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const createAuditApiUrl = (input: {
  action: string;
  apiBaseUrl: string;
  entityType: string;
  page?: number;
  pageSize?: number;
  path: string;
  q: string;
}): string => {
  const url = new URL(input.path, input.apiBaseUrl);

  if (typeof input.page === "number") {
    url.searchParams.set("page", String(input.page));
  }

  if (typeof input.pageSize === "number") {
    url.searchParams.set("pageSize", String(input.pageSize));
  }

  if (input.q.trim().length > 0) {
    url.searchParams.set("q", input.q.trim());
  }

  if (input.action.trim().length > 0) {
    url.searchParams.set("action", input.action.trim());
  }

  if (input.entityType.trim().length > 0) {
    url.searchParams.set("entityType", input.entityType.trim());
  }

  return url.toString();
};

const parseContentDispositionFilename = (
  contentDisposition: string | null,
): string | null => {
  if (!contentDisposition) {
    return null;
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);

  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const unquotedMatch = contentDisposition.match(/filename=([^;]+)/i);

  return unquotedMatch?.[1]?.trim() ?? null;
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

export const listAuditLogs = async (input: {
  action: string;
  accessToken: string;
  apiBaseUrl: string;
  entityType: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  page: number;
  pageSize: number;
  q: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createAuditApiUrl({
                action: input.action,
                apiBaseUrl: input.apiBaseUrl,
                entityType: input.entityType,
                path: "/api/audit",
                page: input.page,
                pageSize: input.pageSize,
                q: input.q,
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
              createAuditApiUrl({
                action: input.action,
                apiBaseUrl: input.apiBaseUrl,
                entityType: input.entityType,
                path: "/api/audit",
                page: input.page,
                pageSize: input.pageSize,
                q: input.q,
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
    fallbackErrorMessage: "Failed to load audit log",
    response,
  });

  try {
    return AuditLogListResponseSchema.parse(body);
  } catch {
    throw new Error("Audit response does not match the shared DTO contract");
  }
};

export const exportAuditLogsCsv = async (input: {
  action: string;
  accessToken: string;
  apiBaseUrl: string;
  entityType: string;
  fetchImpl?: typeof fetch;
  onAccessTokenExpired?: () => Promise<string | null>;
  q: string;
}) => {
  const response = await performAuthorizedRequest(
    input.onAccessTokenExpired
      ? {
          accessToken: input.accessToken,
          execute: async (accessToken) => {
            return (input.fetchImpl ?? defaultFetchImpl)(
              createAuditApiUrl({
                action: input.action,
                apiBaseUrl: input.apiBaseUrl,
                entityType: input.entityType,
                path: "/api/audit/export",
                q: input.q,
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
              createAuditApiUrl({
                action: input.action,
                apiBaseUrl: input.apiBaseUrl,
                entityType: input.entityType,
                path: "/api/audit/export",
                q: input.q,
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

  if (!response.ok) {
    const body = await safeParseJson(response);
    const apiError = parseApiError(body);

    throw new Error(apiError?.error.message ?? "Failed to export audit log");
  }

  return {
    content: await response.text(),
    filename:
      parseContentDispositionFilename(
        response.headers.get("content-disposition"),
      ) ?? "audit-export.csv",
  };
};
