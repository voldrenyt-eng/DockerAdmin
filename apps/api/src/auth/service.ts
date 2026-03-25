import {
  type AuthDto,
  type AuthLoginRequestDto,
  type AuthLogoutRequestDto,
  type AuthRefreshRequestDto,
  AuthSchema,
  type AuthUserDto,
  AuthUserSchema,
} from "@dockeradmin/shared";

import type { AuditLogRepository } from "../audit/repository.js";
import { appErrors } from "../errors.js";
import { verifyPassword } from "./password.js";
import type { AuthRepository, AuthUserRecord } from "./repository.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
} from "./tokens.js";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type AuthService = {
  getCurrentUser: (accessToken: string) => Promise<AuthUserDto>;
  login: (input: AuthLoginRequestDto) => Promise<AuthDto>;
  logout: (input: AuthLogoutRequestDto) => Promise<void>;
  refresh: (input: AuthRefreshRequestDto) => Promise<AuthDto>;
};

type CreateAuthServiceOptions = {
  auditLogRepository?: AuditLogRepository;
  authRepository: AuthRepository;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  now?: () => Date;
};

const addSeconds = (date: Date, seconds: number): Date => {
  return new Date(date.getTime() + seconds * 1000);
};

const toAuthUser = (user: AuthUserRecord): AuthUserDto => {
  return AuthUserSchema.parse({
    email: user.email,
    id: user.id,
    role: user.role,
  });
};

const createAuthPayload = async (
  user: AuthUserRecord,
  options: CreateAuthServiceOptions,
  now: Date,
): Promise<AuthDto> => {
  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashRefreshToken(
    refreshToken,
    options.jwtRefreshSecret,
  );
  const accessToken = createAccessToken(
    {
      email: user.email,
      role: user.role,
      sub: user.id,
    },
    options.jwtAccessSecret,
    now,
    ACCESS_TOKEN_TTL_SECONDS,
  );

  await options.authRepository.createRefreshToken({
    expiresAt: addSeconds(now, REFRESH_TOKEN_TTL_SECONDS),
    tokenHash: refreshTokenHash,
    userId: user.id,
  });

  return AuthSchema.parse({
    tokens: {
      accessToken,
      refreshToken,
    },
    user: toAuthUser(user),
  });
};

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
    // Audit persistence must never change the auth outcome.
  }
};

export const createAuthService = (
  options: CreateAuthServiceOptions,
): AuthService => {
  const getNow = options.now ?? (() => new Date());

  return {
    async getCurrentUser(accessToken) {
      const now = getNow();
      const claims = verifyAccessToken(
        accessToken,
        options.jwtAccessSecret,
        now,
      );

      if (!claims) {
        throw appErrors.unauthorized("Invalid or expired access token");
      }

      const user = await options.authRepository.findUserById(claims.sub);

      if (!user) {
        throw appErrors.unauthorized("Invalid or expired access token");
      }

      return toAuthUser(user);
    },
    async login(input) {
      const user = await options.authRepository.findUserByEmail(input.email);

      if (!user) {
        await writeAuditLogBestEffort({
          auditLogRepository: options.auditLogRepository,
          record: {
            action: "AUTH_LOGIN",
            entityId: null,
            entityType: "auth",
            message: "Login failed",
            projectId: null,
            userId: null,
          },
        });
        throw appErrors.unauthorized("Invalid email or password");
      }

      const isValidPassword = await verifyPassword(
        input.password,
        user.passwordHash,
      );

      if (!isValidPassword) {
        await writeAuditLogBestEffort({
          auditLogRepository: options.auditLogRepository,
          record: {
            action: "AUTH_LOGIN",
            entityId: user.id,
            entityType: "auth",
            message: "Login failed",
            projectId: null,
            userId: user.id,
          },
        });
        throw appErrors.unauthorized("Invalid email or password");
      }

      const payload = await createAuthPayload(user, options, getNow());

      await writeAuditLogBestEffort({
        auditLogRepository: options.auditLogRepository,
        record: {
          action: "AUTH_LOGIN",
          entityId: user.id,
          entityType: "auth",
          message: "Login succeeded",
          projectId: null,
          userId: user.id,
        },
      });

      return payload;
    },
    async logout(input) {
      const now = getNow();
      const refreshTokenHash = hashRefreshToken(
        input.refreshToken,
        options.jwtRefreshSecret,
      );
      const storedRefreshToken =
        await options.authRepository.findRefreshTokenByHash(refreshTokenHash);

      if (
        !storedRefreshToken ||
        storedRefreshToken.revokedAt ||
        storedRefreshToken.expiresAt <= now
      ) {
        throw appErrors.unauthorized("Invalid or expired refresh token");
      }

      await options.authRepository.revokeRefreshToken(
        storedRefreshToken.id,
        now,
      );

      await writeAuditLogBestEffort({
        auditLogRepository: options.auditLogRepository,
        record: {
          action: "AUTH_LOGOUT",
          entityId: storedRefreshToken.userId,
          entityType: "auth",
          message: "Logout succeeded",
          projectId: null,
          userId: storedRefreshToken.userId,
        },
      });
    },
    async refresh(input) {
      const now = getNow();
      const refreshTokenHash = hashRefreshToken(
        input.refreshToken,
        options.jwtRefreshSecret,
      );
      const storedRefreshToken =
        await options.authRepository.findRefreshTokenByHash(refreshTokenHash);

      if (
        !storedRefreshToken ||
        storedRefreshToken.revokedAt ||
        storedRefreshToken.expiresAt <= now
      ) {
        throw appErrors.unauthorized("Invalid or expired refresh token");
      }

      const user = await options.authRepository.findUserById(
        storedRefreshToken.userId,
      );

      if (!user) {
        throw appErrors.unauthorized("Invalid or expired refresh token");
      }

      await options.authRepository.revokeRefreshToken(
        storedRefreshToken.id,
        now,
      );

      return createAuthPayload(user, options, now);
    },
  };
};
