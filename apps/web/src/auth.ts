import {
  type AuthDto,
  AuthLoginRequestSchema,
  AuthLogoutRequestSchema,
  AuthRefreshRequestSchema,
  AuthSchema,
  parseApiError,
} from "@dockeradmin/shared";

export const authSessionStorageKey = "dockeradmin.auth.session";

type AuthStorageReader = Pick<Storage, "getItem">;
type AuthStorageWriter = Pick<Storage, "setItem">;
type AuthStorageRemover = Pick<Storage, "removeItem">;

const defaultFetchImpl = (...args: Parameters<typeof fetch>) => {
  return fetch(...args);
};

const createAuthApiUrl = (input: {
  apiBaseUrl: string;
  path: "/api/auth/login" | "/api/auth/logout" | "/api/auth/refresh";
}): string => {
  return new URL(input.path, input.apiBaseUrl).toString();
};

const safeParseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

const parseAuthResponse = async (input: {
  fallbackErrorMessage: string;
  response: Response;
}): Promise<AuthDto> => {
  const body = await safeParseJson(input.response);

  if (!input.response.ok) {
    const apiError = parseApiError(body);

    throw new Error(apiError?.error.message ?? input.fallbackErrorMessage);
  }

  try {
    return AuthSchema.parse(body);
  } catch {
    throw new Error("Auth response does not match the shared DTO contract");
  }
};

export const readStoredAuthSession = (
  storage: AuthStorageReader | null,
): AuthDto | null => {
  const rawValue = storage?.getItem(authSessionStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return AuthSchema.parse(JSON.parse(rawValue));
  } catch {
    return null;
  }
};

export const writeStoredAuthSession = (
  storage: AuthStorageWriter | null,
  session: AuthDto,
): void => {
  storage?.setItem(authSessionStorageKey, JSON.stringify(session));
};

export const clearStoredAuthSession = (
  storage: AuthStorageRemover | null,
): void => {
  storage?.removeItem(authSessionStorageKey);
};

export const loginWithPassword = async (input: {
  apiBaseUrl: string;
  email: string;
  fetchImpl?: typeof fetch;
  password: string;
}): Promise<AuthDto> => {
  const payload = AuthLoginRequestSchema.parse({
    email: input.email,
    password: input.password,
  });
  const response = await (input.fetchImpl ?? defaultFetchImpl)(
    createAuthApiUrl({
      apiBaseUrl: input.apiBaseUrl,
      path: "/api/auth/login",
    }),
    {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  return parseAuthResponse({
    fallbackErrorMessage: "Login failed",
    response,
  });
};

export const refreshAuthSession = async (input: {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  refreshToken: string;
}): Promise<AuthDto> => {
  const payload = AuthRefreshRequestSchema.parse({
    refreshToken: input.refreshToken,
  });
  const response = await (input.fetchImpl ?? defaultFetchImpl)(
    createAuthApiUrl({
      apiBaseUrl: input.apiBaseUrl,
      path: "/api/auth/refresh",
    }),
    {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  return parseAuthResponse({
    fallbackErrorMessage: "Session refresh failed",
    response,
  });
};

export const logoutAuthSession = async (input: {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  refreshToken: string;
}): Promise<void> => {
  const payload = AuthLogoutRequestSchema.parse({
    refreshToken: input.refreshToken,
  });
  const response = await (input.fetchImpl ?? defaultFetchImpl)(
    createAuthApiUrl({
      apiBaseUrl: input.apiBaseUrl,
      path: "/api/auth/logout",
    }),
    {
      body: JSON.stringify(payload),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (response.ok) {
    return;
  }

  const body = await safeParseJson(response);
  const apiError = parseApiError(body);

  throw new Error(
    toErrorMessage(
      apiError ? new Error(apiError.error.message) : null,
      "Logout failed",
    ),
  );
};
