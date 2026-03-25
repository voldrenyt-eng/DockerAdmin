import type { FastifyReply } from "fastify";

export const DEFAULT_WEB_ORIGIN = "http://localhost:5173";

const ALLOWED_CORS_METHODS = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_ALLOWED_CORS_HEADERS = "authorization,content-type";

const SECURITY_HEADERS = {
  "permissions-policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

const normalizeHeaderValue = (
  value: string | string[] | undefined,
): string | null => {
  if (typeof value === "string") {
    const normalizedValue = value.trim();

    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];

    return typeof firstValue === "string"
      ? normalizeHeaderValue(firstValue)
      : null;
  }

  return null;
};

const appendVaryValue = (
  reply: Pick<FastifyReply, "getHeader" | "header">,
  value: string,
) => {
  const currentHeader = reply.getHeader("vary");
  const currentValues =
    typeof currentHeader === "string"
      ? currentHeader
          .split(",")
          .map((token) => token.trim())
          .filter((token) => token.length > 0)
      : [];

  if (!currentValues.includes(value)) {
    currentValues.push(value);
  }

  reply.header("vary", currentValues.join(", "));
};

export const normalizeWebOrigin = (value: string): string => {
  return new URL(value).origin;
};

export const resolveAllowedCorsOrigin = (input: {
  originHeader: string | string[] | undefined;
  webOrigin: string;
}): string | null => {
  const origin = normalizeHeaderValue(input.originHeader);

  return origin === input.webOrigin ? origin : null;
};

export const applySecurityHeaders = (
  reply: Pick<FastifyReply, "header">,
): void => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    reply.header(name, value);
  }
};

export const applyCorsHeaders = (input: {
  allowedOrigin: string;
  reply: Pick<FastifyReply, "getHeader" | "header">;
}): void => {
  input.reply.header("access-control-allow-origin", input.allowedOrigin);
  appendVaryValue(input.reply, "Origin");
};

export const applyCorsPreflightHeaders = (input: {
  allowedOrigin: string;
  reply: Pick<FastifyReply, "getHeader" | "header">;
  requestHeaders: string | string[] | undefined;
}): void => {
  applyCorsHeaders({
    allowedOrigin: input.allowedOrigin,
    reply: input.reply,
  });

  input.reply.header("access-control-allow-methods", ALLOWED_CORS_METHODS);
  input.reply.header(
    "access-control-allow-headers",
    normalizeHeaderValue(input.requestHeaders) ?? DEFAULT_ALLOWED_CORS_HEADERS,
  );
  appendVaryValue(input.reply, "Access-Control-Request-Headers");
};
