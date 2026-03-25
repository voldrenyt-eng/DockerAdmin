import {
  type ApiErrorCodeDto,
  type ApiErrorDto,
  ApiErrorSchema,
  ApiErrorStatusByCode,
} from "@dockeradmin/shared";

export const VALIDATION_ERROR_MESSAGE =
  "Request payload does not match the shared DTO contract";
export const INTERNAL_ERROR_MESSAGE = "Internal server error";
export const NOT_FOUND_ERROR_MESSAGE = "Route not found";

export class AppError extends Error {
  readonly code: ApiErrorCodeDto;
  readonly statusCode: number;

  constructor(code: ApiErrorCodeDto, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
    this.statusCode = ApiErrorStatusByCode[code];
  }
}

const createApiError = (code: ApiErrorCodeDto, message: string): ApiErrorDto =>
  ApiErrorSchema.parse({
    error: {
      code,
      message,
    },
  });

export const appErrors = {
  conflict: (message = "Resource state conflict") =>
    new AppError("CONFLICT", message),
  forbidden: (message = "Action is forbidden") =>
    new AppError("FORBIDDEN", message),
  notFound: (message = NOT_FOUND_ERROR_MESSAGE) =>
    new AppError("NOT_FOUND", message),
  unauthorized: (message = "Authentication required") =>
    new AppError("UNAUTHORIZED", message),
  validation: (message = VALIDATION_ERROR_MESSAGE) =>
    new AppError("VALIDATION_ERROR", message),
};

export const toApiErrorResponse = (
  error: unknown,
): {
  payload: ApiErrorDto;
  statusCode: number;
} => {
  if (error instanceof AppError) {
    return {
      payload: createApiError(error.code, error.message),
      statusCode: error.statusCode,
    };
  }

  return {
    payload: createApiError("INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE),
    statusCode: ApiErrorStatusByCode.INTERNAL_ERROR,
  };
};
