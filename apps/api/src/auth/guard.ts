import type { AuthUserDto } from "@dockeradmin/shared";
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import { appErrors } from "../errors.js";
import type { AuthService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: AuthUserDto;
  }
}

const getBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw appErrors.unauthorized();
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw appErrors.unauthorized("Invalid or expired access token");
  }

  return token;
};

export const createAdminGuard = (
  authService: Pick<AuthService, "getCurrentUser">,
): preHandlerHookHandler => {
  return async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> => {
    request.currentUser = await authService.getCurrentUser(
      getBearerToken(request.headers.authorization),
    );
  };
};
